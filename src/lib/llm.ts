import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

export interface ExtractionOptions {
    markdown: string;
    schema?: Record<string, unknown>;
    title: string;
    extractionType?: ExtractionType;
}

export interface ExtractionResult {
    data: Record<string, unknown>;
    model: string;
    tokensUsed?: number;
    extractionType: ExtractionType;
}

/**
 * Supported extraction types with specialized prompts
 */
export type ExtractionType =
    | "auto"
    | "article"
    | "product"
    | "contact"
    | "event"
    | "job"
    | "recipe"
    | "review";

/**
 * Specialized prompts for different extraction types
 */
const EXTRACTION_PROMPTS: Record<ExtractionType, string> = {
    auto: `You are a precise data extraction engine. Analyze the content and extract structured data.

RULES:
1. Return ONLY valid JSON - no explanations, no markdown code blocks.
2. If a JSON schema is provided, extract data according to that schema exactly.
3. If no schema is provided, create a structured summary with:
   - title: The page title
   - summary: A 1-2 sentence description
   - mainContent: Key content extracted
   - entities: People, organizations, or things mentioned
   - links: Important URLs found
4. Use null for fields you cannot extract. Never invent data.`,

    article: `You are an expert article extraction engine. Extract news/blog article data.

SCHEMA (use if no custom schema provided):
{
  "title": "Article headline",
  "author": "Author name(s)",
  "publishDate": "ISO date or relative date string",
  "summary": "2-3 sentence summary of the article",
  "content": "Main article body text",
  "tags": ["topic tags extracted from content"],
  "readingTimeMinutes": "estimated reading time"
}

RULES:
1. Return ONLY valid JSON.
2. Extract the author even if it says "By [Name]" or "Written by [Name]".
3. For dates, prefer ISO format (YYYY-MM-DD) when possible.
4. Tags should be inferred from content if not explicitly listed.
5. Use null for missing fields.`,

    product: `You are an expert e-commerce data extraction engine. Extract product information.

SCHEMA (use if no custom schema provided):
{
  "name": "Product name",
  "price": "Current price as string with currency",
  "originalPrice": "Original price if on sale",
  "currency": "Currency code (USD, EUR, etc.)",
  "rating": "Rating as number (e.g., 4.5)",
  "reviewCount": "Number of reviews",
  "availability": "In Stock / Out of Stock / Limited",
  "description": "Product description",
  "features": ["List of key features"],
  "specifications": {"key": "value pairs"},
  "brand": "Brand name",
  "sku": "Product SKU/ID if available"
}

RULES:
1. Return ONLY valid JSON.
2. Extract prices with currency symbols intact.
3. Convert rating to a number on a 5-point scale.
4. Features should be bullet points from description.
5. Use null for missing fields.`,

    contact: `You are an expert contact information extraction engine. Find people and business contacts.

SCHEMA (use if no custom schema provided):
{
  "contacts": [
    {
      "name": "Full name",
      "title": "Job title",
      "company": "Company name",
      "email": "Email address",
      "phone": "Phone number(s)",
      "address": "Physical address",
      "linkedin": "LinkedIn URL",
      "twitter": "Twitter handle"
    }
  ],
  "company": {
    "name": "Company name",
    "address": "Company address",
    "phone": "Main phone",
    "email": "General email",
    "website": "Website URL"
  }
}

RULES:
1. Return ONLY valid JSON.
2. Extract ALL contact information found on the page.
3. Normalize phone numbers if possible.
4. Include social media handles without the @ symbol.
5. Use null for missing fields.`,

    event: `You are an expert event data extraction engine. Extract event and scheduling information.

SCHEMA (use if no custom schema provided):
{
  "name": "Event name",
  "description": "Event description",
  "startDate": "ISO datetime",
  "endDate": "ISO datetime",
  "timezone": "Timezone",
  "location": {
    "name": "Venue name",
    "address": "Full address",
    "city": "City",
    "country": "Country",
    "virtual": "true/false if online event",
    "url": "Virtual event URL"
  },
  "organizer": "Organizer name",
  "price": "Ticket price or Free",
  "registrationUrl": "Registration/ticket URL",
  "speakers": ["Speaker names"],
  "tags": ["event categories"]
}

RULES:
1. Return ONLY valid JSON.
2. Convert dates to ISO 8601 format when possible.
3. Identify if event is virtual, in-person, or hybrid.
4. Extract pricing tiers if multiple ticket types exist.
5. Use null for missing fields.`,

    job: `You are an expert job posting extraction engine. Extract job listing information.

SCHEMA (use if no custom schema provided):
{
  "title": "Job title",
  "company": "Company name",
  "location": "Job location",
  "remote": "true/false/hybrid",
  "salary": {
    "min": "Minimum salary",
    "max": "Maximum salary",
    "currency": "Currency code",
    "period": "yearly/monthly/hourly"
  },
  "employmentType": "Full-time/Part-time/Contract",
  "experienceLevel": "Entry/Mid/Senior/Executive",
  "description": "Job description summary",
  "requirements": ["Required qualifications"],
  "benefits": ["Listed benefits"],
  "skills": ["Required/preferred skills"],
  "applicationUrl": "Apply URL",
  "postedDate": "When job was posted"
}

RULES:
1. Return ONLY valid JSON.
2. Infer remote status from location or description.
3. Parse salary ranges into min/max values.
4. Separate hard requirements from nice-to-haves.
5. Use null for missing fields.`,

    recipe: `You are an expert recipe extraction engine. Extract cooking recipe information.

SCHEMA (use if no custom schema provided):
{
  "name": "Recipe name",
  "description": "Brief description",
  "author": "Recipe author",
  "prepTime": "Prep time in minutes",
  "cookTime": "Cook time in minutes",
  "totalTime": "Total time in minutes",
  "servings": "Number of servings",
  "difficulty": "Easy/Medium/Hard",
  "ingredients": [
    {"item": "ingredient name", "amount": "quantity", "unit": "unit"}
  ],
  "instructions": ["Step-by-step instructions"],
  "nutrition": {
    "calories": "per serving",
    "protein": "grams",
    "carbs": "grams",
    "fat": "grams"
  },
  "tags": ["cuisine type", "diet tags"],
  "rating": "Rating if available"
}

RULES:
1. Return ONLY valid JSON.
2. Separate ingredient amounts from descriptions.
3. Number the instruction steps.
4. Convert time strings to minutes.
5. Use null for missing fields.`,

    review: `You are an expert review extraction engine. Extract product/service review information.

SCHEMA (use if no custom schema provided):
{
  "itemReviewed": "Product or service name",
  "overallRating": "Average rating",
  "totalReviews": "Number of reviews",
  "ratingBreakdown": {
    "5star": "percentage or count",
    "4star": "percentage or count",
    "3star": "percentage or count",
    "2star": "percentage or count",
    "1star": "percentage or count"
  },
  "reviews": [
    {
      "author": "Reviewer name",
      "rating": "Individual rating",
      "date": "Review date",
      "title": "Review title",
      "content": "Review text",
      "helpful": "Helpful votes count",
      "verified": "true/false"
    }
  ],
  "pros": ["Common positive points"],
  "cons": ["Common negative points"]
}

RULES:
1. Return ONLY valid JSON.
2. Extract individual reviews if visible.
3. Identify verified purchase reviews.
4. Summarize common pros/cons across reviews.
5. Use null for missing fields.`,
};

/**
 * Detect extraction type based on schema fields
 */
function detectExtractionType(schema?: Record<string, unknown>): ExtractionType {
    if (!schema) return "auto";

    const schemaStr = JSON.stringify(schema).toLowerCase();

    // Check for product-related fields
    if (
        schemaStr.includes("price") ||
        schemaStr.includes("sku") ||
        schemaStr.includes("availability")
    ) {
        return "product";
    }

    // Check for article-related fields
    if (
        schemaStr.includes("author") &&
        (schemaStr.includes("publishdate") ||
            schemaStr.includes("content") ||
            schemaStr.includes("article"))
    ) {
        return "article";
    }

    // Check for contact-related fields
    if (
        schemaStr.includes("email") ||
        schemaStr.includes("phone") ||
        schemaStr.includes("linkedin")
    ) {
        return "contact";
    }

    // Check for event-related fields
    if (
        schemaStr.includes("startdate") ||
        schemaStr.includes("enddate") ||
        schemaStr.includes("venue") ||
        schemaStr.includes("registration")
    ) {
        return "event";
    }

    // Check for job-related fields
    if (
        schemaStr.includes("salary") ||
        schemaStr.includes("requirements") ||
        schemaStr.includes("employmenttype")
    ) {
        return "job";
    }

    // Check for recipe-related fields
    if (
        schemaStr.includes("ingredients") ||
        schemaStr.includes("cooktime") ||
        schemaStr.includes("servings")
    ) {
        return "recipe";
    }

    // Check for review-related fields
    if (
        schemaStr.includes("rating") &&
        (schemaStr.includes("review") || schemaStr.includes("pros"))
    ) {
        return "review";
    }

    return "auto";
}

/**
 * Extracts structured data from Markdown content using Gemini
 */
export async function extractWithGemini(
    apiKey: string,
    options: ExtractionOptions
): Promise<ExtractionResult> {
    const { markdown, schema, title, extractionType: requestedType } = options;

    // Detect or use provided extraction type
    const extractionType = requestedType || detectExtractionType(schema);
    const systemPrompt = EXTRACTION_PROMPTS[extractionType];

    // Initialize the Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model: GenerativeModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
    });

    // Build the user prompt
    let userPrompt = `Page Title: ${title}\n`;
    userPrompt += `Detected Content Type: ${extractionType}\n\n`;

    if (schema) {
        userPrompt += `CUSTOM SCHEMA (use this instead of default):\n${JSON.stringify(schema, null, 2)}\n\n`;
    }

    userPrompt += `CONTENT TO EXTRACT FROM:\n\n${markdown}`;

    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [{ text: systemPrompt + "\n\n" + userPrompt }],
                },
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
            },
        });

        const response = result.response;
        const text = response.text();

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

        const tokensUsed = response.usageMetadata?.totalTokenCount;

        return {
            data: parsedData,
            model: "gemini-2.5-flash-lite",
            tokensUsed,
            extractionType,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Gemini API error: ${errorMessage}`);
    }
}

/**
 * Alternative: Direct REST API call to Gemini
 */
export async function extractWithGeminiRest(
    apiKey: string,
    options: ExtractionOptions
): Promise<ExtractionResult> {
    const { markdown, schema, title, extractionType: requestedType } = options;

    const extractionType = requestedType || detectExtractionType(schema);
    const systemPrompt = EXTRACTION_PROMPTS[extractionType];

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    let userPrompt = `Page Title: ${title}\n`;
    userPrompt += `Detected Content Type: ${extractionType}\n\n`;

    if (schema) {
        userPrompt += `CUSTOM SCHEMA (use this instead of default):\n${JSON.stringify(schema, null, 2)}\n\n`;
    }

    userPrompt += `CONTENT TO EXTRACT FROM:\n\n${markdown}`;

    const requestBody = {
        contents: [
            {
                parts: [{ text: systemPrompt + "\n\n" + userPrompt }],
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
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
        extractionType,
    };
}
