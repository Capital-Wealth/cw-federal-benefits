import { NextRequest } from "next/server";
import {
  calculateRetirementProjection,
  compareScenarios,
} from "@/lib/calculation/fers-engine";
import type { FederalBenefitsIntake } from "@/types";

/**
 * POST /api/calculate
 *
 * Accepts intake data and returns a retirement projection.
 * Optionally compares multiple retirement date scenarios.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { intake, scenarioDates } = body as {
    intake: FederalBenefitsIntake;
    scenarioDates?: string[];
  };

  if (!intake) {
    return Response.json({ error: "intake data is required" }, { status: 400 });
  }

  if (
    !intake.serviceComputationDate ||
    !intake.desiredRetirementDate ||
    !intake.currentAnnualSalary
  ) {
    return Response.json(
      {
        error:
          "Missing required fields: serviceComputationDate, desiredRetirementDate, currentAnnualSalary",
      },
      { status: 400 }
    );
  }

  // Single projection
  const projection = calculateRetirementProjection(intake);
  if (!projection) {
    return Response.json(
      { error: "Could not calculate projection with provided data" },
      { status: 422 }
    );
  }

  // Scenario comparison if multiple dates provided
  let comparison;
  if (scenarioDates && scenarioDates.length > 0) {
    const allDates = [intake.desiredRetirementDate, ...scenarioDates];
    comparison = compareScenarios(intake, allDates);
  }

  return Response.json({
    projection,
    comparison: comparison || null,
  });
}
