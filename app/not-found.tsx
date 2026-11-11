import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <section className="space-y-5 py-8">
      <MapPinOff aria-hidden="true" size={32} strokeWidth={1.75} className="text-primary-700" />
      <p className="text-xs font-semibold tracking-widest text-primary-700">404</p>
      <h1 className="text-2xl font-semibold">페이지를 찾을 수 없어요</h1>
      <p className="text-sm leading-relaxed text-neutral-600">주소가 변경되었거나 없는 페이지입니다. 홈에서 필요한 메뉴를 찾아보세요.</p>
      <Link href="/" className="button-primary w-full">홈으로 이동</Link>
    </section>
  );
}
