import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { scrapeUrl } from "./lib/scraper";
import { extractWithGemini } from "./lib/llm";

// Define the environment bindings type
interface Env {
    BROWSER?: Fetcher; // Optional - only needed for browser rendering (paid plan)
    GEMINI_API_KEY: string;
}

// Request body schema using Zod
const ExtractRequestSchema = z.object({
    url: z.string().url("Invalid URL format"),
    schema: z.record(z.unknown()).optional(),
    waitFor: z.string().optional(),
});

type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

// Response types
interface ExtractResponse {
    success: true;
    data: Record<string, unknown>;
    metadata: {
        url: string;
        title: string;
        model: string;
        tokensUsed?: number;
        processingTimeMs: number;
    };
}

interface ErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: string;
    };
}

// Create the Hono app
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use("*", cors());

// Root endpoint - API info
app.get("/", (c) => {
    return c.json({
        name: "Universal Read API",
        version: "10.0",
        description: "Turn any website URL into structured JSON data for AI agents",
        endpoints: {
            "POST /extract": {
                description: "Extract structured data from a URL",
                body: {
                    url: "string (required) - URL to scrape",
                    schema: "object (optional) - JSON schema for extraction",
                    waitFor: "string (optional) - CSS selector to wait for",
                },
            },
            "GET /health": "Health check endpoint",
        },
        example: {
            request: {
                url: "https://example.com",
                schema: { title: "string", summary: "string" },
            },
        },
    });
});

// Health check endpoint
app.get("/health", (c) => {
    return c.json({
        status: "healthy",
        service: "universal-read-api",
        timestamp: new Date().toISOString(),
    });
});

// Main extraction endpoint
app.post("/extract", async (c) => {
    const startTime = Date.now();

    try {
        // Parse and validate the request body
        const body = await c.req.json();
        const parseResult = ExtractRequestSchema.safeParse(body);

        if (!parseResult.success) {
            const response: ErrorResponse = {
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid request body",
                    details: parseResult.error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", "),
                },
            };
            return c.json(response, 400);
        }

        const { url, schema, waitFor }: ExtractRequest = parseResult.data;

        // Check for required API key
        if (!c.env.GEMINI_API_KEY) {
            const response: ErrorResponse = {
                success: false,
                error: {
                    code: "CONFIGURATION_ERROR",
                    message: "GEMINI_API_KEY is not configured",
                },
            };
            return c.json(response, 500);
        }

        // Step A: Scrape the webpage
        console.log(`[Scraper] Starting scrape for: ${url}`);
        const scrapeResult = await scrapeUrl(c.env.BROWSER, {
            url,
            waitFor,
        });
        console.log(
            `[Scraper] Scraped ${scrapeResult.markdown.length} characters of Markdown`
        );

        // Step B: Already done in scraper (HTML -> Markdown conversion)

        // Step C: Extract structured data using Gemini
        console.log(`[LLM] Sending to Gemini for extraction`);
        const extractionResult = await extractWithGemini(c.env.GEMINI_API_KEY, {
            markdown: scrapeResult.markdown,
            schema,
            title: scrapeResult.title,
        });
        console.log(`[LLM] Extraction complete`);

        // Step D: Return the response
        const processingTimeMs = Date.now() - startTime;

        const response: ExtractResponse = {
            success: true,
            data: extractionResult.data,
            metadata: {
                url: scrapeResult.url,
                title: scrapeResult.title,
                model: extractionResult.model,
                tokensUsed: extractionResult.tokensUsed,
                processingTimeMs,
            },
        };

        return c.json(response);
    } catch (error) {
        console.error("[Error]", error);

        const processingTimeMs = Date.now() - startTime;
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";

        // Determine error type and code
        let errorCode = "INTERNAL_ERROR";
        let statusCode: 400 | 500 | 502 | 504 = 500;

        if (errorMessage.includes("Navigation timeout")) {
            errorCode = "TIMEOUT_ERROR";
            statusCode = 504;
        } else if (errorMessage.includes("net::ERR_")) {
            errorCode = "NETWORK_ERROR";
            statusCode = 502;
        } else if (errorMessage.includes("Gemini API error")) {
            errorCode = "LLM_ERROR";
            statusCode = 502;
        }

        const response: ErrorResponse = {
            success: false,
            error: {
                code: errorCode,
                message: errorMessage,
                details: `Processing time before error: ${processingTimeMs}ms`,
            },
        };

        return c.json(response, statusCode);
    }
});

// 404 handler
app.notFound((c) => {
    return c.json(
        {
            success: false,
            error: {
                code: "NOT_FOUND",
                message: `Route ${c.req.method} ${c.req.path} not found`,
            },
        },
        404
    );
});

// Error handler
app.onError((err, c) => {
    console.error("[Unhandled Error]", err);
    return c.json(
        {
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
                details: err.message,
            },
        },
        500
    );
});

export default app;
