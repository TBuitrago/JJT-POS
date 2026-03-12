export interface OrderEmailData {
    orderNumber: string;
    clientName: string;
    clientEmail: string;
    items: Array<{
        product_name: string;
        product_sku: string;
        quantity: number;
        unit_price: number;
        original_price?: number | null;
        price_note?: string | null;
        line_total: number;
    }>;
    subtotalGross: number;
    discountPercentage: number;
    subtotalNet: number;
    shippingCost: number;
    total: number;
    paymentMethod: 'cash' | 'transfer';
    notes?: string | null;
}
export declare function sendOrderConfirmation(data: OrderEmailData): Promise<void>;
//# sourceMappingURL=email.d.ts.map