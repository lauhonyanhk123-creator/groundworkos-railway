/**
 * CIS (Construction Industry Scheme) status verification.
 *
 * STUB IMPLEMENTATION: this module does not call HMRC. There is no public,
 * self-service HMRC API for verifying a subcontractor's CIS status by UTR -
 * contractors currently do this through HMRC's own CIS verification
 * service using their own HMRC credentials. A real integration would need
 * to be built against whatever access HMRC actually grants (e.g. an
 * agent-authorised service), which requires credentials this environment
 * does not have.
 *
 * To avoid ever reporting a false "verified" result, this stub always
 * returns "unverified" plus a reference that makes clear no real check
 * ran. Replace the body of verifyCisStatus() once a real HMRC integration
 * (or a licensed third-party CIS verification provider) is available.
 */
export interface CisVerificationResult {
  status: "unverified";
  reference: string;
  checkedAt: string;
}

export async function verifyCisStatus(utrNumber: string | null): Promise<CisVerificationResult> {
  if (!utrNumber || !utrNumber.trim()) {
    throw new Error("A UTR number is required before CIS status can be verified.");
  }
  return {
    status: "unverified",
    reference: "STUB-NOT-CONNECTED-TO-HMRC",
    checkedAt: new Date().toISOString(),
  };
}
