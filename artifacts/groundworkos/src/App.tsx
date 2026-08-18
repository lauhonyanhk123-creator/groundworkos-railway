import { useEffect, useRef, useState } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  useLocation,
  Redirect,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Toaster } from "sonner";
import {
  Briefcase,
  Receipt,
  ShieldCheck,
  HardHat,
  Truck,
  FolderOpen,
} from "lucide-react";
import { AppProvider } from "./store/AppContext";
import { DataLoader } from "./store/DataLoader";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/JobsPage";
import { QuotesPage } from "./pages/QuotesPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { SchedulePage } from "./pages/SchedulePage";
import { ClientsPage } from "./pages/ClientsPage";
import { SubcontractorsPage } from "./pages/SubcontractorsPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { PlantPage } from "./pages/PlantPage";
import { ReportsPage } from "./pages/ReportsPage";
import { TimesheetsPage } from "./pages/TimesheetsPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsersPage } from "./pages/UsersPage";
import { PortalPage } from "./pages/PortalPage";
import { useRole } from "./hooks/useRole";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { ImportPage } from "./pages/ImportPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import NotFound from "./pages/not-found";
import { DeployPage } from "./pages/DeployPage";
import { useApp } from "./store/AppContext";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#1b5e78",
    colorForeground: "#181410",
    colorMutedForeground: "#7a7469",
    colorDanger: "#c13a2a",
    colorBackground: "#fafaf8",
    colorInput: "#ffffff",
    colorInputForeground: "#181410",
    colorNeutral: "#d9d4ce",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[#fafaf8] rounded-xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: {
      color: "#181410",
      fontWeight: "700",
      fontFamily: "'Space Grotesk', sans-serif",
      letterSpacing: "-0.02em",
    },
    headerSubtitle: { color: "#7a7469", fontSize: "14px" },
    socialButtonsBlockButtonText: {
      color: "#181410",
      fontWeight: "500",
      fontSize: "14px",
    },
    formFieldLabel: {
      color: "#4a4540",
      fontWeight: "600",
      fontSize: "11px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
    },
    footerActionLink: { color: "#1b5e78", fontWeight: "600" },
    footerActionText: { color: "#7a7469" },
    dividerText: { color: "#a8a099", fontSize: "12px" },
    identityPreviewEditButton: { color: "#1b5e78" },
    formFieldSuccessText: { color: "#2a6e45" },
    alertText: { color: "#c13a2a" },
    logoBox: "hidden",
    socialButtonsBlockButton: {
      border: "1px solid #d9d4ce",
      backgroundColor: "#ffffff",
      borderRadius: "6px",
    },
    formButtonPrimary: {
      backgroundColor: "#1b5e78",
      color: "#ffffff",
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: "600",
      borderRadius: "6px",
    },
    formFieldInput: {
      border: "1px solid #d9d4ce",
      backgroundColor: "#ffffff",
      color: "#181410",
      borderRadius: "6px",
    },
    footerAction: {
      backgroundColor: "#eeeae4",
      borderTop: "1px solid #d9d4ce",
    },
    dividerLine: { backgroundColor: "#e0dbd5" },
    alert: {
      border: "1px solid rgba(193,58,42,0.2)",
      backgroundColor: "rgba(193,58,42,0.05)",
      borderRadius: "6px",
    },
    otpCodeFieldInput: { border: "1px solid #d9d4ce", borderRadius: "6px" },
    formFieldRow: {},
    main: {},
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function SignInPage() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4"
      style={{ backgroundColor: "#f0ede8" }}
    >
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4"
      style={{ backgroundColor: "#f0ede8" }}
    >
      <p
        style={{
          maxWidth: 440,
          textAlign: "center",
          fontSize: 13,
          color: "#7a7469",
          fontFamily: "'Inter', sans-serif",
          lineHeight: 1.6,
        }}
      >
        GroundworkOS is invite-only. If you've received an invitation email,
        use the same email address below to finish setting up your account.
        Otherwise, ask your admin to invite you from Settings &rarr; Users.
      </p>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

const FEATURES = [
  {
    Icon: Briefcase,
    title: "Jobs & Scheduling",
    desc: "Track every job from tender to handover. Assign crews, foremen and plant. Monitor progress in real time.",
  },
  {
    Icon: Receipt,
    title: "Invoicing & Quotes",
    desc: "Create CIS-compliant quotes and invoices. Send to clients, track overdue payments and collect faster.",
  },
  {
    Icon: ShieldCheck,
    title: "CIS Compliance",
    desc: "Automated CIS300 returns. Verify subcontractor UTRs, track deduction rates and generate HMRC submissions.",
  },
  {
    Icon: HardHat,
    title: "Subcontractors",
    desc: "Manage your supply chain. Track UTRs, CSCS cards, NRSWA certification and PL insurance expiry dates.",
  },
  {
    Icon: Truck,
    title: "Plant & Fleet",
    desc: "Register your fleet. Track service intervals, MOTs, LOLER thorough examination dates and daily rates.",
  },
  {
    Icon: FolderOpen,
    title: "Documents",
    desc: "Store RAMS, permits and insurance documents centrally. Get alerted before any document expires.",
  },
];

function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div
      style={{
        backgroundColor: "#f0ede8",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          backgroundColor: "#fafaf8",
          borderBottom: "1px solid #d9d4ce",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1024,
            margin: "0 auto",
            padding: "0 24px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: "#181410",
                letterSpacing: "0.04em",
              }}
            >
              GROUNDWORK<span style={{ color: "#1b5e78" }}>OS</span>
            </span>
          </div>
          <button
            onClick={() => setLocation("/sign-in")}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#1b5e78",
              padding: "6px 18px",
              borderRadius: 6,
              border: "1.5px solid #1b5e78",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
      </header>

      <section
        style={{
          maxWidth: 1024,
          margin: "0 auto",
          padding: "80px 24px 72px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "4px 14px",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#1b5e78",
            backgroundColor: "#e8f3f7",
            border: "1px solid rgba(27,94,120,0.2)",
            marginBottom: 24,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          Built for the UK groundwork trade
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(36px, 5vw, 52px)",
            color: "#181410",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            marginBottom: 20,
          }}
        >
          The OS for groundwork
          <br />
          contractors
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "#4a4540",
            lineHeight: 1.7,
            maxWidth: 560,
            margin: "0 auto 40px",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Manage jobs, CIS compliance, quotes, invoices, plant and
          subcontractors — all in one platform built for the way UK groundwork
          companies actually operate.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setLocation("/sign-up")}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#ffffff",
              padding: "12px 28px",
              borderRadius: 8,
              backgroundColor: "#1b5e78",
              border: "none",
              cursor: "pointer",
            }}
          >
            Get Started
          </button>
          <button
            onClick={() => setLocation("/sign-in")}
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#181410",
              padding: "12px 28px",
              borderRadius: 8,
              backgroundColor: "transparent",
              border: "1.5px solid #d9d4ce",
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
      </section>

      <section
        style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px 80px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              style={{
                padding: 24,
                borderRadius: 12,
                backgroundColor: "#fafaf8",
                border: "1px solid #d9d4ce",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: "#e8f3f7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <Icon style={{ width: 18, height: 18, color: "#1b5e78" }} />
              </div>
              <h3
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "#181410",
                  marginBottom: 8,
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "#7a7469",
                  lineHeight: 1.65,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #d9d4ce", marginTop: "auto" }}>
        <div
          style={{
            maxWidth: 1024,
            margin: "0 auto",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#a8a099",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span>© 2025 GroundworkOS</span>
          <span>UK construction management</span>
        </div>
      </footer>
    </div>
  );
}

function ForemanRedirect({ children }: { children: React.ReactNode }) {
  const role = useRole();
  const [location, setLocation] = useLocation();
  // "/settings/users" is allowed for foremen too: UsersPage does its own
  // role gating, and a brand-new deployment has no admin yet, so the first
  // (default-foreman) user must be able to reach it to self-promote.
  const FOREMAN_ALLOWED = [
    "/",
    "/jobs",
    "/schedule",
    "/timesheets",
    "/settings/users",
  ];
  const blocked =
    role === "foreman" &&
    !FOREMAN_ALLOWED.some(
      (p) => location === p || (p !== "/" && location.startsWith(p)),
    );

  // Navigation is a side effect and must not run during render (it triggers a
  // parent state update while this component is still rendering, which React
  // flags and can leave the redirect in an inconsistent state).
  useEffect(() => {
    if (blocked) setLocation("/");
  }, [blocked, setLocation]);

  // Render a visible placeholder instead of null while the redirect effect
  // fires, so blocked routes never show a bare blank/white page.
  if (blocked) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7a7469",
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
        }}
      >
        Redirecting…
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { state } = useApp();
  const [wizardDone, setWizardDone] = useState(() => {
    try {
      return !!localStorage.getItem("gw_onboarding_done");
    } catch {
      return false;
    }
  });

  function completeWizard() {
    try {
      localStorage.setItem("gw_onboarding_done", "1");
    } catch {}
    setWizardDone(true);
  }

  const needsOnboarding =
    state.settingsLoaded &&
    (!state.settings.companyName ||
      state.settings.companyName === "GroundworkOS Ltd") &&
    !wizardDone;

  return (
    <>
      {needsOnboarding && <OnboardingWizard onComplete={completeWizard} />}
      <ForemanRedirect>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/jobs" component={JobsPage} />
            <Route path="/jobs/:id" component={JobsPage} />
            <Route path="/quotes" component={QuotesPage} />
            <Route path="/invoices" component={InvoicesPage} />
            <Route path="/schedule" component={SchedulePage} />
            <Route path="/clients" component={ClientsPage} />
            <Route path="/subcontractors" component={SubcontractorsPage} />
            <Route path="/documents" component={DocumentsPage} />
            <Route path="/plant" component={PlantPage} />
            <Route path="/timesheets" component={TimesheetsPage} />
            <Route path="/purchase-orders" component={PurchaseOrdersPage} />
            <Route path="/reports" component={ReportsPage} />
            <Route path="/import" component={ImportPage} />
            <Route path="/audit" component={AuditLogPage} />
            <Route path="/deploy" component={DeployPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/settings/users" component={UsersPage} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </ForemanRedirect>
    </>
  );
}

function AuthenticatedApp() {
  return (
    <AppProvider>
      <DataLoader />
      <AppRoutes />
    </AppProvider>
  );
}

function RouteGuard() {
  const [location] = useLocation();
  const isHome = location === "/" || location === "";
  return (
    <>
      <Show when="signed-in">
        <AuthenticatedApp />
      </Show>
      <Show when="signed-out">
        {isHome ? <LandingPage /> : <Redirect to="/sign-in" />}
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: { title: "Welcome back", subtitle: "Sign in to GroundworkOS" },
        },
        signUp: {
          start: {
            title: "Create account",
            subtitle: "Join GroundworkOS today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Toaster position="bottom-right" richColors closeButton />
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/portal/:token" component={PortalPage} />
          <Route component={RouteGuard} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
