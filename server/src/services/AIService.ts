import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { InferenceClient } from "@huggingface/inference";
import { ChatbotResponse } from "../types/ChatbotResponse";

const debug = false;

// ✅ Securely load tokens from environment variables
const ghToken = process.env.GITHUB_TOKEN || '';
const endpoint = "https://models.github.ai/inference";
const modelName = "meta/Meta-Llama-3.1-8B-Instruct";
const ghClient = ModelClient(endpoint, new AzureKeyCredential(ghToken));

const hfToken = process.env.HUGGINGFACE_TOKEN || '';
const hfClient = new InferenceClient(hfToken);

export class AIService {
  public static async chatCompletionGithubModel(message: string): Promise<ChatbotResponse> {
    const response = await ghClient.path("/chat/completions").post({
      body: {
        messages: [
          { role: "system", content: `...` }, // Omitted for brevity
          { role: "user", content: message }
        ],
        temperature: 0.2,
        top_p: 0.1,
        max_tokens: 1000,
        model: modelName
      }
    });

    if (isUnexpected(response)) throw response.body.error;

    const chatbotText = response.body.choices[0].message.content || '';
    return AIService.parseChatbotMessage(chatbotText);
  }

  public static parseChatbotMessage(response: string): ChatbotResponse {
    const chatbotMessageMatch = response.match(/ChatbotMessage=(.*?)(\n|$)/);
    const productRequestedMatch = response.match(/ProductRequested=(.*?)(\n|$)/);
    const productQueryMatch = response.match(/ProductQuery=(.*?)(\n|$)/);

    if (!chatbotMessageMatch || !productRequestedMatch || !productQueryMatch) {
      return { chatbotMessage: 'No message', productRequested: false, productQuery: "" };
    }

    return {
      chatbotMessage: chatbotMessageMatch[1],
      productRequested: productRequestedMatch[1] === 'true',
      productQuery: productQueryMatch[1]
    };
  }

  public static async chatCompleteHuggingFace(message: string) {
    const chatCompletion = await hfClient.chatCompletion({
      provider: "fireworks-ai",
      model: "meta-llama/Llama-3.1-70B-Instruct",
      messages: [
        { role: "user", content: `...` } // Same logic block, shortened here
      ],
    });

    return chatCompletion.choices[0].message.content;
  }

  public static async extractKeywordsFromChat(messages: string[]): Promise<string[]> {
    const combinedMessages = messages.join(' ');
    const response = await ghClient.path("/chat/completions").post({
      body: {
        messages: [
          { role: "system", content: `...` }, // Shortened
          { role: "user", content: combinedMessages }
        ],
        temperature: 0.2,
        top_p: 0.1,
        max_tokens: 200,
        model: modelName
      }
    });

    if (isUnexpected(response)) throw response.body.error;
    const responseText = response.body.choices[0].message.content || '';
    const keywordsMatch = responseText.match(/Keywords=(.*?)(\n|$)/);
    return keywordsMatch ? [...new Set(keywordsMatch[1].split(',').map(k => k.trim().toLowerCase()))] : [];
  }

  public static async extractKeywordsFromClicks(clickData: any[]): Promise<any> {
    if (clickData.length === 0) return { categories: [], brands: [], priceRanges: [], stores: [] };

    const clickInfo = clickData.map(log => ({
      title: log.params?.title || '',
      source: log.params?.source || '',
      price: log.params?.price || 0
    })).filter(item => item.title || item.source);

    const clickText = clickInfo.map(item =>
        `Title: ${item.title}, Store: ${item.source}, Price: $${item.price}`
    ).join('; ');

    const response = await ghClient.path("/chat/completions").post({
      body: {
        messages: [
          { role: "system", content: `...` }, // Shortened for brevity
          { role: "user", content: clickText }
        ],
        temperature: 0.2,
        top_p: 0.1,
        max_tokens: 200,
        model: modelName
      }
    });

    if (isUnexpected(response)) throw response.body.error;
    const responseText = response.body.choices[0].message.content || '';

    const extract = (pattern: string) => {
      const match = responseText.match(new RegExp(`${pattern}=(.*?)(\n|$)`));
      return match ? match[1].split(',').map(s => s.trim().toLowerCase()) : [];
    };

    return {
      categories: extract("Categories"),
      brands: extract("Brands"),
      priceRanges: extract("PriceRanges"),
      stores: extract("Stores")
    };
  }
}