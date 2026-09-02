import { auth } from "@/features/auth/auth";
import { getPublicMessageById } from "@/features/board/repository";
import { memoryRepository, physicalOrderRepository } from "@/features/memories/repository";
import { userRepository } from "@/features/users/repository";
import { OrderDetailContent } from "./_components/OrderDetailContent";

// Depends on runtime DB state and admin session — never prerendered.
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  const session = await auth();
  const authorized = session?.user?.role === "admin";

  if (!authorized) {
    return <OrderDetailContent authorized={false} order={null} project={null} message={null} customer={null} />;
  }

  const order = await physicalOrderRepository.getByOrderNumber(orderNumber);
  const project = order ? await memoryRepository.getById(order.memoryProjectId) : null;
  const [message, customer] = await Promise.all([
    project ? getPublicMessageById(project.messageId) : null,
    order ? userRepository.getById(order.createdBy) : null,
  ]);

  return (
    <OrderDetailContent
      authorized
      order={order}
      project={project}
      message={message}
      customer={customer ? { name: customer.name, email: customer.email } : null}
    />
  );
}
