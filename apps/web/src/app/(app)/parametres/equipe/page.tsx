import { connection } from "next/server";
import { api } from "@/lib/api";
import { TeamPanel } from "@/components/settings/team-panel";

export default async function TeamPage() {
  await connection();
  return <TeamPanel team={await api.team()} />;
}
