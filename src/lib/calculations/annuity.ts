/**
 * Federal Annuity Calculations
 *
 * Implements annuity formulas for all federal retirement systems:
 * - FERS Basic Annuity (1% rule, 1.1% rule for age >= 62 with 20+ years)
 * - CSRS Tiered Annuity (1.5% / 1.75% / 2%)
 * - CSRS Offset (CSRS formula, reduced at 62 by SS earned during offset service)
 * - FERS Transfer (CSRS component + FERS component)
 * - Special Provisions (LEO / Firefighter / ATC: 1.7% first 20, 1% thereafter)
 */

import type {
  EmploymentInfo,
  EmployeeType,
  AnnuityResult,
  MilitaryService,
} from '../calc-types';
import { calculateTotalService, serviceToDecimalYears } from './service';
import { calculateHigh3 } from './high3';

/**
 * FERS Basic Annuity
 *
 * Standard: 1% × high-3 × years of service
 * Enhanced: 1.1% × high-3 × years if retiring at age >= 62 with >= 20 years
 */
export function calculateFersAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number,
  ageAtRetirement: number
): { annual: number; multiplier: number } {
  const totalYears = serviceToDecimalYears(serviceYears, serviceMonths);
  const multiplier =
    ageAtRetirement >= 62 && totalYears >= 20 ? 0.011 : 0.01;
  const annual = multiplier * high3 * totalYears;
  return {
    annual: Math.round(annual * 100) / 100,
    multiplier,
  };
}

/**
 * FERS Special Provisions (LEO, Firefighter, ATC)
 *
 * 1.7% × high-3 for first 20 years
 * 1.0% × high-3 for years exceeding 20
 */
export function calculateFersSpecialAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number
): { annual: number; multiplier: number } {
  const totalYears = serviceToDecimalYears(serviceYears, serviceMonths);
  let annual: number;

  if (totalYears <= 20) {
    annual = 0.017 * high3 * totalYears;
  } else {
    annual = 0.017 * high3 * 20 + 0.01 * high3 * (totalYears - 20);
  }

  // Effective multiplier for display
  const effectiveMultiplier = totalYears > 0 ? annual / (high3 * totalYears) : 0;

  return {
    annual: Math.round(annual * 100) / 100,
    multiplier: Math.round(effectiveMultiplier * 10000) / 10000,
  };
}

/**
 * CSRS Tiered Annuity
 *
 * 1.5% × high-3 × first 5 years
 * 1.75% × high-3 × next 5 years (years 6-10)
 * 2.0% × high-3 × years exceeding 10
 *
 * Maximum: 80% of high-3
 */
export function calculateCsrsAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number
): { annual: number; multiplier: number } {
  const totalYears = serviceToDecimalYears(serviceYears, serviceMonths);
  let annual = 0;

  if (totalYears <= 5) {
    annual = 0.015 * high3 * totalYears;
  } else if (totalYears <= 10) {
    annual = 0.015 * high3 * 5 + 0.0175 * high3 * (totalYears - 5);
  } else {
    annual =
      0.015 * high3 * 5 +
      0.0175 * high3 * 5 +
      0.02 * high3 * (totalYears - 10);
  }

  // CSRS cap: 80% of high-3
  const cap = 0.8 * high3;
  annual = Math.min(annual, cap);

  const effectiveMultiplier = totalYears > 0 ? annual / (high3 * totalYears) : 0;

  return {
    annual: Math.round(annual * 100) / 100,
    multiplier: Math.round(effectiveMultiplier * 10000) / 10000,
  };
}

/**
 * Congressional/Senate Annuity
 *
 * For Members of Congress and Congressional Employees with at least 5 years
 * of Congressional service:
 * - 1.7% × high-3 × years of Congressional service (up to 20 years)
 * - 1% × high-3 × remaining years
 */
export function calculateCongressionalAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number,
  hireDate?: string,
  ageAtRetirement?: number,
): { annual: number; multiplier: number } {
  const totalYears = serviceToDecimalYears(serviceYears, serviceMonths);

  // Post-2014 Congressional hires lost the enhanced 1.7% accrual; they follow
  // standard FERS rules (5 USC § 8415(b) as amended by P.L. 112-96 and 113-67).
  if (hireDate) {
    const hireYear = new Date(hireDate).getFullYear();
    if (hireYear >= 2014) {
      const standardMult =
        ageAtRetirement != null && ageAtRetirement >= 62 && totalYears >= 20
          ? 0.011
          : 0.01;
      const annual = standardMult * high3 * totalYears;
      return {
        annual: Math.round(annual * 100) / 100,
        multiplier: standardMult,
      };
    }
  }

  // Pre-2014 enhanced Congressional formula: 1.7% × first 20 yrs + 1.0% × remainder.
  let annual: number;
  if (totalYears <= 20) {
    annual = 0.017 * high3 * totalYears;
  } else {
    annual = 0.017 * high3 * 20 + 0.01 * high3 * (totalYears - 20);
  }

  const effectiveMultiplier = totalYears > 0 ? annual / (high3 * totalYears) : 0;

  return {
    annual: Math.round(annual * 100) / 100,
    multiplier: Math.round(effectiveMultiplier * 10000) / 10000,
  };
}

/**
 * CSRS Special Provisions (LEO/Firefighter/Nuclear Material Courier)
 *
 * - 2.5% × high-3 × first 20 years of special provision service
 * - 2% × high-3 × remaining years
 * Subject to 80% of high-3 cap.
 */
export function calculateCsrsSpecialAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number
): { annual: number; multiplier: number } {
  const totalYears = serviceToDecimalYears(serviceYears, serviceMonths);
  let annual: number;

  if (totalYears <= 20) {
    annual = 0.025 * high3 * totalYears;
  } else {
    annual = 0.025 * high3 * 20 + 0.02 * high3 * (totalYears - 20);
  }

  // CSRS cap: 80% of high-3
  const cap = 0.8 * high3;
  annual = Math.min(annual, cap);

  const effectiveMultiplier = totalYears > 0 ? annual / (high3 * totalYears) : 0;

  return {
    annual: Math.round(annual * 100) / 100,
    multiplier: Math.round(effectiveMultiplier * 10000) / 10000,
  };
}

/**
 * CSRS Offset Annuity
 *
 * Same formula as CSRS, but at age 62 the annuity is reduced by the
 * portion of the Social Security benefit attributable to CSRS Offset service.
 *
 * The offset amount is estimated as:
 *   SS benefit at 62 × (CSRS Offset service years / 40)
 *
 * This is a simplified estimate; actual offset is computed by SSA.
 */
export function calculateCsrsOffsetAnnuity(
  high3: number,
  serviceYears: number,
  serviceMonths: number,
  estimatedSSAt62: number,
  offsetServiceYears: number
): { annual: number; offsetAmount: number; multiplier: number } {
  const csrs = calculateCsrsAnnuity(high3, serviceYears, serviceMonths);
  // Offset = portion of SS attributable to offset service
  const offsetAmount = Math.round(estimatedSSAt62 * 12 * (offsetServiceYears / 40) * 100) / 100;
  const annual = Math.max(csrs.annual - offsetAmount, 0);

  return {
    annual: Math.round(annual * 100) / 100,
    offsetAmount,
    multiplier: csrs.multiplier,
  };
}

/**
 * FERS Transfer Annuity
 *
 * For employees who transferred from CSRS to FERS:
 * - CSRS component: CSRS tiered formula applied to CSRS service years
 * - FERS component: FERS formula applied to FERS service years
 * - Both use the same high-3 average salary
 */
export function calculateFersTransferAnnuity(
  high3: number,
  csrsYears: number,
  csrsMonths: number,
  fersYears: number,
  fersMonths: number,
  ageAtRetirement: number
): { annual: number; csrsComponent: number; fersComponent: number; multiplier: number } {
  const csrs = calculateCsrsAnnuity(high3, csrsYears, csrsMonths);
  const fers = calculateFersAnnuity(high3, fersYears, fersMonths, ageAtRetirement);

  const annual = csrs.annual + fers.annual;
  const totalYears = serviceToDecimalYears(csrsYears, csrsMonths) +
    serviceToDecimalYears(fersYears, fersMonths);
  const effectiveMultiplier = totalYears > 0 ? annual / (high3 * totalYears) : 0;

  return {
    annual: Math.round(annual * 100) / 100,
    csrsComponent: csrs.annual,
    fersComponent: fers.annual,
    multiplier: Math.round(effectiveMultiplier * 10000) / 10000,
  };
}

/**
 * Determine if employee is a special provision (LEO/FF/ATC) type.
 */
function isSpecialProvision(employeeType: EmployeeType): boolean {
  return (
    employeeType === 'LEO' ||
    employeeType === 'FIREFIGHTER' ||
    employeeType === 'ATC'
  );
}

/**
 * Determine if employee is a Congressional/Senate type.
 */
function isCongressional(employeeType: EmployeeType): boolean {
  return employeeType === 'CONGRESSIONAL';
}

/**
 * Full annuity calculation with explicit age.
 * This is the preferred entry point from the orchestrator.
 */
export function calculateAnnuityWithAge(
  employment: EmploymentInfo,
  military: MilitaryService,
  ageAtRetirement: number,
  estimatedSSAt62: number = 0
): AnnuityResult {
  const service = calculateTotalService(employment, military);
  const { high3Average } = calculateHigh3(employment);

  const sickLeaveCredit = serviceToDecimalYears(
    service.sickLeaveCreditYears,
    service.sickLeaveCreditMonths
  );

  let annual: number;
  let multiplier: number;
  let csrsComponent: number | undefined;
  let fersComponent: number | undefined;

  switch (employment.retirementSystem) {
    case 'FERS': {
      if (isCongressional(employment.employeeType)) {
        const cong = calculateCongressionalAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths
        );
        annual = cong.annual;
        multiplier = cong.multiplier;
      } else if (isSpecialProvision(employment.employeeType)) {
        const sp = calculateFersSpecialAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths
        );
        annual = sp.annual;
        multiplier = sp.multiplier;
      } else {
        const fers = calculateFersAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths,
          ageAtRetirement
        );
        annual = fers.annual;
        multiplier = fers.multiplier;
      }
      break;
    }

    case 'CSRS': {
      if (isSpecialProvision(employment.employeeType)) {
        const csrsSp = calculateCsrsSpecialAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths
        );
        annual = csrsSp.annual;
        multiplier = csrsSp.multiplier;
      } else if (isCongressional(employment.employeeType)) {
        const cong = calculateCongressionalAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths
        );
        annual = cong.annual;
        multiplier = cong.multiplier;
      } else {
        const csrs = calculateCsrsAnnuity(
          high3Average,
          service.totalYears,
          service.totalMonths
        );
        annual = csrs.annual;
        multiplier = csrs.multiplier;
      }
      break;
    }

    case 'CSRS_OFFSET': {
      // Use total service for the CSRS formula; offset service = total civilian
      const offset = calculateCsrsOffsetAnnuity(
        high3Average,
        service.totalYears,
        service.totalMonths,
        estimatedSSAt62,
        service.civilianYears + service.civilianMonths / 12
      );
      annual = offset.annual;
      multiplier = offset.multiplier;
      break;
    }

    case 'FERS_TRANSFER': {
      const csrsYears = employment.csrsServiceYears ?? 0;
      const csrsMonths = employment.csrsServiceMonths ?? 0;
      const fersYears = employment.fersServiceYears ?? 0;
      const fersMonths = employment.fersServiceMonths ?? 0;

      const transfer = calculateFersTransferAnnuity(
        high3Average,
        csrsYears,
        csrsMonths,
        fersYears,
        fersMonths,
        ageAtRetirement
      );
      annual = transfer.annual;
      multiplier = transfer.multiplier;
      csrsComponent = transfer.csrsComponent;
      fersComponent = transfer.fersComponent;
      break;
    }

    default:
      annual = 0;
      multiplier = 0;
  }

  return {
    annualAnnuity: Math.round(annual * 100) / 100,
    monthlyAnnuity: Math.round((annual / 12) * 100) / 100,
    high3Average,
    totalServiceYears: service.totalYears,
    totalServiceMonths: service.totalMonths,
    sickLeaveCredit,
    multiplier,
    csrsComponent,
    fersComponent,
  };
}
