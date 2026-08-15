import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import storageRouter from "./storage";
import clientsRouter from "./clients";
import jobsRouter from "./jobs";
import quotesRouter from "./quotes";
import invoicesRouter from "./invoices";
import subcontractorsRouter from "./subcontractors";
import documentsRouter from "./documents";
import scheduleRouter from "./schedule";
import plantRouter from "./plant";
import rateBookRouter from "./rate_book";
import dashboardRouter from "./dashboard";
import xeroRouter from "./xero";
import quickbooksRouter from "./quickbooks";
import sageRouter from "./sage";
import freeagentRouter from "./freeagent";
import settingsRouter from "./settings";
import cisRouter from "./cis";
import portalRouter from "./portal";
import adminRouter from "./admin";
import timesheetsRouter from "./timesheets";
import purchaseOrdersRouter from "./purchase_orders";
import emailRouter from "./email";
import auditRouter from "./audit";

const router: IRouter = Router();

const PUBLIC_PATHS = [
  "/healthz",
  "/xero/callback",
  "/quickbooks/callback",
  "/sage/callback",
  "/freeagent/callback",
  "/portal",
];

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (
    PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + "/"))
  ) {
    return next();
  }
  const auth = getAuth(req);
  const userId = (auth as any)?.sessionClaims?.userId || (auth as any)?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as any).userId = userId;
  next();
}

router.use(requireAuth);

router.use(storageRouter);
router.use(healthRouter);
router.use(clientsRouter);
router.use(jobsRouter);
router.use(quotesRouter);
router.use(invoicesRouter);
router.use(subcontractorsRouter);
router.use(documentsRouter);
router.use(scheduleRouter);
router.use(plantRouter);
router.use(rateBookRouter);
router.use(dashboardRouter);
router.use(xeroRouter);
router.use(quickbooksRouter);
router.use(sageRouter);
router.use(freeagentRouter);
router.use(settingsRouter);
router.use(cisRouter);
router.use(portalRouter);
router.use(adminRouter);
router.use(timesheetsRouter);
router.use(purchaseOrdersRouter);
router.use(emailRouter);
router.use(auditRouter);

export default router;
