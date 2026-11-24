export type DigitalConfigStatus = "active" | "revoked" | "error";

export type DigitalConfigView = {
  id: string;
  label: string;
  email: string;
  subscriptionUrl: string;
  inboundIds: number[];
  status: DigitalConfigStatus;
  trafficLimitGb: number | null;
  expiresOn: string | null;
  createdAt: string;
  errorMessage: string | null;
  ownerId: string;
  ownerName: string;
  ownerDepartment: string | null;
};

export type DigitalTabData = {
  /** False until the digital migration is applied. */
  available: boolean;
  /** False until the 3x-ui env vars are set. */
  configured: boolean;
  /** Full name used as the panel client name. */
  fullName: string;
  selfServiceEnabled: boolean;
  /** null = unlimited (owner). */
  quota: number | null;
  used: number;
  canCreate: boolean;
  configs: DigitalConfigView[];
};

export type DigitalUserRow = {
  id: string;
  name: string;
  department: string | null;
  role: string;
  quota: number | null;
  used: number;
};

export type DigitalSettingsView = {
  selfServiceEnabled: boolean;
  defaultInboundIds: number[];
  managerQuotaCap: number;
  subBaseUrl: string | null;
};

export type DigitalAdminData = {
  available: boolean;
  configured: boolean;
  inbounds: {
    id: number;
    remark: string;
    protocol: string;
    port: number;
    enable: boolean;
  }[];
  inboundsError: string | null;
  settings: DigitalSettingsView;
  canManageNodes: boolean;
  isOwner: boolean;
  users: DigitalUserRow[];
  configs: DigitalConfigView[];
};
