import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { sampleCatalogProducts } from "../../lib/catalog/sample-data";
const [action, statePath] = process.argv.slice(2);
if (!/^\/tmp\/sikin-catalog-fixture-[a-f0-9-]+\.json$/.test(statePath ?? ""))
  throw new Error("Invalid fixture state path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const prisma = getPrisma();
const stateSchema = z.object({ userId: z.uuid(), productIds: z.array(z.uuid()) });
try {
  if (action === "initialize") {
    const user = await prisma.user.create({ data: { nickname: "화장품 화면 검증 회원" } });
    const productIds = Array.from({ length: 32 }, () => randomUUID());
    await writeFile(statePath, JSON.stringify({ userId: user.id, productIds }), {
      flag: "wx",
      mode: 0o600,
    });
    const token = randomBytes(32).toString("hex");
    await prisma.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const session = await prisma.diagnosticSession.create({
      data: {
        userId: user.id,
        status: "COMPLETED",
        surveyAnswers: { fixture: true },
        axisScores: {},
        report: {
          create: {
            baumannType: "OSNW",
            oilinessScore: 50,
            sensitivityScore: 50,
            pigmentationScore: 50,
            elasticityScore: 50,
            summaryText: "테스트 전용 리포트",
            recommendedIngredients: ["판테놀"],
            cautionIngredients: [],
            aiAuditMetadata: { fixture: true },
          },
        },
      },
      include: { report: true },
    });
    await prisma.product.createMany({
      data: sampleCatalogProducts.map((p, i) => ({
        ...p,
        id: productIds[i],
        isActive: true,
        affiliateBaseUrl: `https://shop.example.com/test-only/${productIds[i]}`,
      })),
    });
    console.log(
      JSON.stringify({
        token,
        reportId: session.report!.id,
        primaryId: productIds[0],
        secondaryId: productIds[4],
      }),
    );
  } else {
    const state = stateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
    if (action === "stockout") {
      await prisma.product.update({
        where: { id: state.productIds[0] },
        data: { status: "OUT_OF_STOCK" },
      });
      console.log("{}");
    } else if (action === "restore") {
      await prisma.product.update({
        where: { id: state.productIds[0] },
        data: { status: "ACTIVE" },
      });
      console.log("{}");
    } else if (action === "clicks") {
      const logs = await prisma.affiliateClickLog.findMany({
        where: { productId: { in: state.productIds } },
        orderBy: { clickedAt: "desc" },
        select: { productId: true, tier: true },
      });
      console.log(JSON.stringify(logs));
    } else if (action === "cleanup") {
      await prisma.affiliateClickLog.deleteMany({ where: { productId: { in: state.productIds } } });
      await prisma.user.delete({ where: { id: state.userId } });
      await prisma.product.deleteMany({ where: { id: { in: state.productIds } } });
      await unlink(statePath);
      console.log("{}");
    } else throw new Error("Unknown fixture operation");
  }
} finally {
  await prisma.$disconnect();
}
