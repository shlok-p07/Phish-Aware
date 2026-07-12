import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import onboardingRouter from "./onboarding";
import lessonsRouter from "./lessons";
import practiceRouter from "./practice";
import dashboardRouter from "./dashboard";
import profileRouter from "./profile";
import leaderboardRouter from "./leaderboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(onboardingRouter);
router.use(lessonsRouter);
router.use(practiceRouter);
router.use(dashboardRouter);
router.use(profileRouter);
router.use(leaderboardRouter);

export default router;
