import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Daily job: sends a (simulated) reminder for every booking whose visit is tomorrow.
export const Route = createFileRoute("/api/public/jobs/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const d = new Date(Date.now() + 2 * 3600000); d.setUTCDate(d.getUTCDate() + 1);
        const tomorrow = d.toISOString().slice(0, 10);
        const { data: rows } = await sb.from("bookings").select("id, service, branch, time").eq("visit_date", tomorrow).is("reminded_at", null);
        for (const b of rows ?? []) {
          await sb.from("notifications").insert({ booking_id: b.id, kind: "reminder", message: `Reminder: ${b.service} at ${b.branch} tomorrow at ${b.time}. Ref ${b.id}.` });
          await sb.from("bookings").update({ reminded_at: new Date().toISOString() }).eq("id", b.id);
        }
        return Response.json({ sent: rows?.length ?? 0 });
      },
    },
  },
});
