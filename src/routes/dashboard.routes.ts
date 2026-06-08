import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();
const controller = new DashboardController();

router.get('/stats', controller.getStatsSummary);
router.post('/restock', controller.restockProduct);

export default router;
