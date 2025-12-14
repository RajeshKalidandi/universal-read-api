import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

export interface ExtractionOptions {
    markdown: string;
    schema?: Record<string, unknown>;
    title: string;
}

export interface ExtractionResult {
    data: Record<string, unknown>;
    model: string;
    tokensUsed?: number;
}

const SYSTEM_PROMPT = `You are a precise data extraction engine. Your task is to extract structured data from the provided Markdown content.

RULES:
1. Return ONLY valid JSON - no explanations, no markdown code blocks, just raw JSON.
2. If a JSON schema is provided, extract data according to that schema exactly.
3. If no schema is provided, create a sensible structured summary with these fields:
   - title: The page title
   - summary: A brief description of the page content
   - mainContent: The primary content/text of the page
   - links: Important links found (if any)
   - metadata: Any relevant metadata extracted
4. If a field cannot be extracted, use null instead of making up data.
5. Be precise and extract only what's actually present in the content.`;

/**
 * Extracts structured data from Markdown content using Gemini 1.5 Flash
 */
export async function extractWithGemini(
    apiKey: string,
    options: ExtractionOptions
): Promise<ExtractionResult> {
    const { markdown, schema, title } = options;

    // Initialize the Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model: GenerativeModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
    });

    // Build the user prompt
    let userPrompt = `Page Title: ${title}\n\n`;

    if (schema) {
        userPrompt += `Extract data according to this JSON schema:\n${JSON.stringify(schema, null, 2)}\n\n`;
    } else {
        userPrompt += `No schema provided. Please extract and structure the page data in a sensible format.\n\n`;
    }

    userPrompt += `Content to extract from:\n\n${markdown}`;

    try {
        // Generate content with Gemini
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }],
                },
            ],
            generationConfig: {
                temperature: 0.1, // Low temperature for precise extraction
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
            },
        });

        const response = result.response;
        const text = response.text();

        // Parse the JSON response
        let parsedData: Record<string, unknown>;
        try {
            // Clean up the response in case there are markdown code blocks
            const cleanedText = text
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
            parsedData = JSON.parse(cleanedText);
        } catch (parseError) {
            // If parsing fails, wrap the raw text in a structured response
            parsedData = {
                rawExtraction: text,
                parseError: "Failed to parse as JSON",
            };
        }

        // Get token usage if available
        const tokensUsed = response.usageMetadata?.totalTokenCount;

        return {
            data: parsedData,
            model: "gemini-2.5-flash-lite",
            tokensUsed,
        };
    } catch (error) {
        // Handle API errors
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Gemini API error: ${errorMessage}`);
    }
}

/**
 * Alternative: Direct REST API call to Gemini (useful if SDK has issues)
 */
export async function extractWithGeminiRest(
    apiKey: string,
    options: ExtractionOptions
): Promise<ExtractionResult> {
    const { markdown, schema, title } = options;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    let userPrompt = `Page Title: ${title}\n\n`;

    if (schema) {
        userPrompt += `Extract data according to this JSON schema:\n${JSON.stringify(schema, null, 2)}\n\n`;
    } else {
        userPrompt += `No schema provided. Please extract and structure the page data in a sensible format.\n\n`;
    }

    userPrompt += `Content to extract from:\n\n${markdown}`;

    const requestBody = {
        contents: [
            {
                parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }],
            },
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
        },
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    interface GeminiResponse {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: string }>;
            };
        }>;
        usageMetadata?: {
            totalTokenCount?: number;
        };
    }

    const result: GeminiResponse = await response.json();

    // Extract the text from the response
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse the JSON response
    let parsedData: Record<string, unknown>;
    try {
        const cleanedText = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
        parsedData = JSON.parse(cleanedText);
    } catch {
        parsedData = {
            rawExtraction: text,
            parseError: "Failed to parse as JSON",
        };
    }

    const tokensUsed = result.usageMetadata?.totalTokenCount;

    return {
        data: parsedData,
        model: "gemini-2.5-flash-lite",
        tokensUsed,
    };
}
