export type TargetRow = {
    id: string;
    created_by: string;
    symbol: string;
    name: string | null;
    market: string;
    tps: number[];
    next_level: number;
    status: string;
    group_chat_id: string | null;
    pick_type?: string | null;
    buy_price_range?: string | null;
};
export declare function processPriceEvent(target: TargetRow, currentPrice: number): Promise<void>;
export declare function onPrice(symbol: string, market: string, price: number): Promise<void>;
//# sourceMappingURL=priceRouter.d.ts.map