import "server-only";

/** Synthetic login email for an employee code, shared with the seed script. */
export function employeeEmailFor(employeeCode: string): string {
  const domain = process.env.EMPLOYEE_EMAIL_DOMAIN || "staff.local";
  return `emp-${employeeCode.trim().toLowerCase()}@${domain}`;
}
