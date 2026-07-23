import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { productCreateSchema } from "@/lib/validators/title";
import { createProduct } from "@/lib/services/edition-service";
import { isValidIsbn13 } from "@/lib/isbn";
import { ok, fail, handleError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("titles.write");
    const input = productCreateSchema.parse(await req.json());
    if (input.isbn13 && !isValidIsbn13(input.isbn13)) {
      return fail("ISBN", "ISBN-13 notoʻgʻri (nazorat raqami mos emas)", 400);
    }
    const product = await createProduct(input, user.id);
    return ok(product, { created: true });
  } catch (e) {
    return handleError(e);
  }
}
