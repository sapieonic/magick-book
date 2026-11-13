import { Suspense } from "react";
import { Logo } from "@/components/ui/Misc";
import { LoginClient } from "./LoginClient";
import { ProductGlimpse } from "./ProductGlimpse";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,1fr)]">
      <section aria-label="About MagickBook" className="flex flex-col gap-6 px-4 pb-4 pt-6 md:px-10 md:pt-10 lg:justify-center lg:gap-10 lg:py-12 xl:px-16">
        <Logo size={30} withWordmark />
        <h1 className="max-w-[18em] text-[24px] font-semibold leading-tight tracking-[-0.01em] md:text-[34px] xl:text-[40px]">
          Every lead, account and rupee, in one daybook.
        </h1>
        <ProductGlimpse className="hidden max-w-[640px] lg:block" />
      </section>
      <div className="flex justify-center px-3 pb-10 md:px-10 lg:items-center lg:py-12">
        <Suspense>
          <LoginClient />
        </Suspense>
      </div>
    </div>
  );
}
