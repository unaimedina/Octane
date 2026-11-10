import { NewChat } from "@/components/chat/new-chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "New session" };

export default function ChatIndexPage() {
  return <NewChat />;
}
