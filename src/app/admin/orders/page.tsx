import { requireAdmin } from "@/features/auth/requireAdmin";
import { memoryRepository, physicalOrderRepository } from "@/features/memories/repository";
import { userRepository } from "@/features/users/repository";
import { OrdersPageContent, type OrderListItem } from "./_components/OrdersPageContent";

export default async function AdminOrdersPage() {
  const adminUser = await requireAdmin();
  const authorized = adminUser !== null;

  let items: OrderListItem[] = [];
  if (authorized) {
    const orders = await physicalOrderRepository.listAll();

    // Admin-only, low-volume screen — a per-order lookup here is simple
    // and clear; not worth a batched query until order volume says otherwise.
    const projects = await Promise.all(orders.map((order) => memoryRepository.getById(order.memoryProjectId)));
    const userIds = [...new Set(orders.map((order) => order.createdBy))];
    const users = await userRepository.getByIds(userIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    items = orders.map((order, index) => {
      const project = projects[index];
      const customer = userById.get(order.createdBy);
      return {
        order,
        outputType: project?.outputType ?? null,
        captureMode: project?.captureMode ?? null,
        frameTemplateId: project?.frameTemplateId ?? null,
        memoryProjectId: project?.id ?? null,
        customerName: customer?.name ?? null,
        customerEmail: customer?.email ?? null,
      };
    });
  }

  return <OrdersPageContent authorized={authorized} items={items} />;
}
