import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import type { TaskCreateInput, TaskUpdateInput } from "@/lib/validators/production";

export async function createTask(input: TaskCreateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.productionTask.create({
      data: {
        titleId: input.titleId,
        name: input.name,
        assigneeId: input.assigneeId ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        dependsOnId: input.dependsOnId ?? null,
        status: "PLANNED",
      },
    });
  });
}

export async function updateTask(id: string, input: TaskUpdateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.productionTask.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status ? { status: input.status as TaskStatus } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
        ...(input.dependsOnId !== undefined ? { dependsOnId: input.dependsOnId } : {}),
      },
    });
  });
}

export async function setTaskStatus(id: string, status: TaskStatus, userId: string) {
  return updateTask(id, { status }, userId);
}
