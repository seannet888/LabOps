-- CreateTable
CREATE TABLE "reservation_allocations" (
    "id" SERIAL NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "inventory_batch_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_allocations_inventory_batch_id_idx" ON "reservation_allocations"("inventory_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_allocations_order_item_id_inventory_batch_id_key" ON "reservation_allocations"("order_item_id", "inventory_batch_id");

-- AddForeignKey
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
