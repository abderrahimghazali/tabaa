import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

async function Go(): Promise<null> {
  await connection();
  redirect("/parametres/entreprise");
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Go />
    </Suspense>
  );
}
