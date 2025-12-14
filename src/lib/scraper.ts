export interface ScrapeResult {
    markdown: string;
    title: string;
    url: string;
}

export interface ScrapeOptions {
    url: string;
    waitFor?: string; // Ignored in HTTP mode, kept for API compatibility
}

// Stealth User-Agent to avoid basic bot detection
const STEALTH_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Convert HTML to Markdown using regex (no DOM required)
 * Works in Cloudflare Workers environment
 */
function htmlToMarkdown(html: string): string {
    let markdown = html;

    // Remove script and style tags with their content
    markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    markdown = markdown.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    markdown = markdown.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

    // Remove HTML comments
    markdown = markdown.replace(/<!--[\s\S]*?-->/g, "");

    // Remove nav, footer, header, aside sections
    markdown = markdown.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
    markdown = markdown.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");
    markdown = markdown.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
    markdown = markdown.replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "");

    // Convert headings
    markdown = markdown.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
    markdown = markdown.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
    markdown = markdown.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
    markdown = markdown.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
    markdown = markdown.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
    markdown = markdown.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");

    // Convert paragraphs
    markdown = markdown.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");

    // Convert line breaks
    markdown = markdown.replace(/<br\s*\/?>/gi, "\n");

    // Convert bold
    markdown = markdown.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");

    // Convert italic
    markdown = markdown.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");

    // Convert links
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
    markdown = markdown.replace(/<a[^>]*href='([^']*)'[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

    // Convert images to alt text
    markdown = markdown.replace(/<img[^>]*alt="([^"]*)"[^>]*\/?>/gi, "[Image: $1]");
    markdown = markdown.replace(/<img[^>]*alt='([^']*)'[^>]*\/?>/gi, "[Image: $1]");
    markdown = markdown.replace(/<img[^>]*\/?>/gi, ""); // Remove images without alt

    // Convert unordered lists
    markdown = markdown.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
        return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    });

    // Convert ordered lists
    let listCounter = 0;
    markdown = markdown.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
        listCounter = 0;
        return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => {
            listCounter++;
            return `${listCounter}. $1\n`;
        });
    });

    // Convert blockquotes
    markdown = markdown.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
        return content.split("\n").map((line: string) => `> ${line}`).join("\n");
    });

    // Convert code blocks
    markdown = markdown.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n");
    markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");

    // Convert inline code
    markdown = markdown.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

    // Convert horizontal rules
    markdown = markdown.replace(/<hr\s*\/?>/gi, "\n---\n");

    // Remove div, span, and other container tags (keep content)
    markdown = markdown.replace(/<(div|span|section|article|main)[^>]*>/gi, "\n");
    markdown = markdown.replace(/<\/(div|span|section|article|main)>/gi, "\n");

    // Remove all remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    markdown = markdown
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

    // Clean up whitespace
    markdown = markdown
        .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
        .replace(/^\s+|\s+$/g, "") // Trim leading/trailing whitespace
        .replace(/[ \t]+$/gm, "") // Remove trailing spaces on each line
        .replace(/[ \t]+/g, " "); // Collapse multiple spaces

    return markdown;
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : "Untitled";
}

/**
 * Extract body content from HTML
 */
function extractBody(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : html;
}

/**
 * Scrapes a webpage using HTTP fetch and converts content to Markdown
 * Works on Cloudflare Workers FREE plan
 */
export async function scrapeUrl(
    _browserBinding: unknown, // Kept for API compatibility, not used
    options: ScrapeOptions
): Promise<ScrapeResult> {
    const { url } = options;

    // Fetch the webpage
    const response = await fetch(url, {
        headers: {
            "User-Agent": STEALTH_USER_AGENT,
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        },
        redirect: "follow",
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Extract title
    const title = extractTitle(html);

    // Extract body and convert to Markdown
    const bodyHtml = extractBody(html);
    const markdown = htmlToMarkdown(bodyHtml);

    return {
        markdown,
        title,
        url,
    };
}
