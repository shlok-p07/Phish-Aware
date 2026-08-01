import { NextRequest } from "next/server";
import { SendChatbotMessageBody, SendChatbotMessageResponse } from "@/api-zod";
import { getChatbotReply, type ChatMessage } from "@/server/chatbot";
import { json, error, requireUserId, withErrorHandling } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  await requireUserId();
  const body = SendChatbotMessageBody.parse(await req.json());

  const reply = await getChatbotReply(body.messages as ChatMessage[]);
  if (reply === null) {
    return error(503, "The assistant is temporarily unavailable. Please try again shortly.");
  }

  return json(SendChatbotMessageResponse.parse({ reply }));
});
