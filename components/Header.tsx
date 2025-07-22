import React from "react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full bg-white border-b flex items-center px-6 py-3 shadow-sm">
      <Link href="/">
        <Image
          src="/guleryuz-logo.png"
          alt="Güleryüz Group Logo"
          width={180}
          height={50}
          priority
        />
      </Link>
    </header>
  );
} 