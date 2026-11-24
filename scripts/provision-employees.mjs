#!/usr/bin/env node
/**
 * Provisions employee accounts from a CSV file.
 *
 *   node --env-file=.env.local scripts/provision-employees.mjs
 *   node --env-file=.env.local scripts/provision-employees.mjs --file supabase/seed/employees.csv
 *   node --env-file=.env.local scripts/provision-employees.mjs --reset-password
 *
 * Columns: username, full_name, employee_code, department, role, initial_password
 * Usernames may be Persian; the login email is synthesized as
 * emp-<employee_code>@<EMPLOYEE_EMAIL_DOMAIN> so Auth always stores ASCII.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Never run this in the browser.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_FILE = "supabase/seed/employees.csv";
const DEFAULT_DOMAIN = "staff.local";

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, resetPassword: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset-password") {
      args.resetPassword = true;
    } else if (arg === "--file") {
      args.file = argv[++i] ?? DEFAULT_FILE;
    }
  }
  return args;
}

function splitRow(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) {
    return [];
  }

  const header = splitRow(lines.shift()).map((key) => key.trim().toLowerCase());

  return lines.map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(
      header.map((key, index) => [key, (cells[index] ?? "").trim()]),
    );
  });
}

function emailFor(employeeCode, domain) {
  return `emp-${employeeCode.toLowerCase()}@${domain}`;
}

async function loadExistingUsers(admin) {
  const byEmail = new Map();

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw error;
    }

    for (const user of data.users) {
      if (user.email) {
        byEmail.set(user.email.toLowerCase(), user.id);
      }
    }

    if (data.users.length < 1000) {
      return byEmail;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const domain = process.env.EMPLOYEE_EMAIL_DOMAIN || DEFAULT_DOMAIN;

  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/provision-employees.mjs",
    );
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), args.file);
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    console.error(
      `Could not read ${filePath}. Copy supabase/seed/employees.example.csv to supabase/seed/employees.csv and fill in the real list.`,
    );
    process.exit(1);
  }

  const rows = parseCsv(content);
  if (rows.length === 0) {
    console.error("The employee file has no data rows.");
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await loadExistingUsers(admin);
  const summary = { created: 0, updated: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // header is line 1
    const missing = [
      "username",
      "full_name",
      "employee_code",
      "initial_password",
    ].filter((key) => !row[key]);

    if (missing.length > 0) {
      console.warn(`Line ${line}: skipping, missing ${missing.join(", ")}`);
      summary.skipped++;
      continue;
    }

    if (row.initial_password.length < 6) {
      console.warn(
        `Line ${line}: skipping, initial_password must be at least 6 characters (Supabase Auth minimum)`,
      );
      summary.skipped++;
      continue;
    }

    const email = emailFor(row.employee_code, domain);
    const role = ["employee", "manager", "admin", "owner"].includes(row.role)
      ? row.role
      : "employee";
    const userMetadata = {
      username: row.username,
      full_name: row.full_name,
      employee_code: row.employee_code,
      department: row.department || null,
      phone: row.phone || null,
    };

    try {
      const existingId = existing.get(email.toLowerCase());
      let userId = existingId;

      if (existingId) {
        const update = {
          email_confirm: true,
          app_metadata: { role },
          user_metadata: userMetadata,
          ...(args.resetPassword ? { password: row.initial_password } : {}),
        };
        const { error } = await admin.auth.admin.updateUserById(
          existingId,
          update,
        );
        if (error) throw error;
        summary.updated++;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: row.initial_password,
          email_confirm: true,
          app_metadata: { role },
          user_metadata: userMetadata,
        });
        if (error) throw error;
        userId = data.user?.id;
        summary.created++;
      }

      if (!userId) {
        throw new Error("Auth returned no user id");
      }

      // Keep the directory row in sync (the auth trigger only runs on insert).
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: row.full_name,
          employee_code: row.employee_code,
          department: row.department || null,
          role,
          email,
          ...(args.resetPassword ? { must_change_password: true } : {}),
        })
        .eq("id", userId);

      if (profileError) throw profileError;

      console.log(
        `${existingId ? "updated" : "created"}  ${row.username}  <${email}>  role=${role}`,
      );
    } catch (error) {
      summary.skipped++;
      console.error(
        `Line ${line}: failed for "${row.username}" — ${error.message}`,
      );
    }
  }

  console.log(
    `\nDone. created=${summary.created} updated=${summary.updated} skipped=${summary.skipped}`,
  );

  if (summary.skipped > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
