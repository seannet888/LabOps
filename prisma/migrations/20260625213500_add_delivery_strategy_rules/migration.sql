CREATE TABLE "delivery_strategy_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "geo_area" VARCHAR(100),
    "amount_threshold" DECIMAL(10,2),
    "quantity_threshold" INTEGER,
    "suggestion_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_strategy_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_strategy_rules_geo_area_idx" ON "delivery_strategy_rules"("geo_area");
CREATE INDEX "delivery_strategy_rules_is_active_idx" ON "delivery_strategy_rules"("is_active");
