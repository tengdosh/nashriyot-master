"use server";

import { revalidatePath } from "next/cache";
import type { PrintOrderStatus, TaskStatus } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { printOrderCreateSchema, taskCreateSchema } from "@/lib/validators/production";
import {
  createPrintOrder,
  transitionPrintOrder,
  receivePrintOrder,
} from "@/lib/services/print-order-service";
import { createTask, setTaskStatus } from "@/lib/services/production-task-service";

export async function createTaskAction(input: unknown) {
  const user = await requirePermission("production.write");
  await createTask(taskCreateSchema.parse(input), user.id);
  revalidatePath("/production");
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  const user = await requirePermission("production.write");
  await setTaskStatus(id, status, user.id);
  revalidatePath("/production");
}

export async function createPrintOrderAction(input: unknown) {
  const user = await requirePermission("production.write");
  await createPrintOrder(printOrderCreateSchema.parse(input), user.id);
  revalidatePath("/production/print-orders");
}

export async function transitionPrintOrderAction(id: string, to: PrintOrderStatus) {
  const user = await requirePermission("production.write");
  await transitionPrintOrder(id, to, user.id);
  revalidatePath("/production/print-orders");
}

export async function receivePrintOrderAction(id: string, actualQty: number, warehouseId: string) {
  const user = await requirePermission("production.write");
  await receivePrintOrder(id, actualQty, warehouseId, user.id);
  revalidatePath("/production/print-orders");
}
