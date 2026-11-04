export type Phase = "capture" | "guide" | "plan";
export type AppView = "home" | "plans" | "plan-detail";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
};
