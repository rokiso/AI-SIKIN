"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ProductView } from "@/lib/catalog/types";
import { cosmeticDisclaimer } from "@/lib/catalog/types";
import { ProductCard } from "./ProductCard";
export function ProductDetailDialog({
  product,
  secondary,
  demo,
  onDismiss,
}: {
  product: ProductView;
  secondary: boolean;
  demo: boolean;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  function dismiss() {
    ref.current?.close();
    onDismiss();
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="product-detail-heading"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm space-y-4 overflow-y-auto rounded-2xl border border-neutral-200 bg-surface p-5 text-neutral-900 backdrop:bg-neutral-900/40"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="product-detail-heading" className="text-lg font-semibold">
          상품 자세히 보기
        </h2>
        <button
          autoFocus
          type="button"
          aria-label="상품 상세 닫기"
          className="button-secondary flex h-12 w-12 shrink-0 items-center justify-center p-0"
          onClick={dismiss}
        >
          <X strokeWidth={1.75} aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      {demo && (
        <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">
          쇼핑 화면 체험용 가상 상품입니다. 실제 구매·결제는 할 수 없어요.
        </p>
      )}
      <ProductCard product={product} secondary={secondary} />
      <p className="text-xs leading-relaxed text-neutral-600">{cosmeticDisclaimer}</p>
      {!demo && (
        <p className="text-xs leading-relaxed text-neutral-600">
          제휴 링크로 이동하며 구매 시 수수료를 받을 수 있습니다. 가격과 재고는 판매처에서
          확인하세요.
        </p>
      )}
    </dialog>
  );
}
