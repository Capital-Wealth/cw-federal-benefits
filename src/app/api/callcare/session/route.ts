import { NextRequest } from "next/server";
import { getSFConnection } from "@/lib/salesforce/connector";

/** Token = the Lead Id (15 or 18 char SF Id). Lead key prefix is 00Q. */
const ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

/**
 * GET /api/callcare/session?token=<leadId>
 * Loads the minimal Lead context the CallCare agent needs to start the call.
 * Standard Lead fields only — no custom-field dependency.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  if (!ID_REGEX.test(token)) {
    return Response.json({ error: "Invalid link." }, { status: 400 });
  }

  try {
    const conn = await getSFConnection();
    const soql = `SELECT Id, Name, FirstName, LastName, Company, Phone, MobilePhone,
        Email, LeadSource, Status, IsConverted, CreatedDate
      FROM Lead WHERE Id = '${token}' LIMIT 1`;
    const res = await conn.query<Record<string, unknown>>(soql);

    if (!res.records.length) {
      return Response.json({ error: "We couldn't find this lead." }, { status: 404 });
    }
    const r = res.records[0];
    if (r.IsConverted) {
      return Response.json(
        { error: "This lead has already been converted.", converted: true },
        { status: 409 }
      );
    }

    return Response.json({
      lead: {
        id: r.Id,
        name: r.Name,
        firstName: r.FirstName ?? "",
        phone: r.Phone ?? r.MobilePhone ?? "",
        email: r.Email ?? "",
        company: r.Company ?? "",
        leadSource: r.LeadSource ?? "",
        status: r.Status ?? "",
        createdDate: r.CreatedDate ?? "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("CallCare session error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
