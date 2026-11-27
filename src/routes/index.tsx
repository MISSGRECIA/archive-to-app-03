import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import cover from "@/assets/beauty-vault-cover.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Beauty Vault — Beauty, Care & Confidence" },
      { name: "description", content: "Look beautiful. Feel confident. Meet VaultBot, The Beauty Vault’s virtual beauty concierge." },
      { property: "og:title", content: "The Beauty Vault — Beauty, Care & Confidence" },
      { property: "og:description", content: "Your Beauty. Your Time. Your Vault. Enter The Beauty Vault with VaultBot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: cover.url },
      { name: "twitter:image", content: cover.url },
    ],
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Italianno&display=swap" }],
  }),
  component: CoverPage,
});

function CoverPage() {
  return (
    <main className="vault-cover">
      <section className="vault-cover-scene">
        <img className="vault-cover-background" src={cover.url} alt="Sunlit champagne silk with soft golden window shadows" fetchPriority="high" />
        <div className="vault-cover-content">
          <div className="vault-cover-copy">
            <p className="vault-cover-headline font-display">To feel good and have confidence</p>
            <p className="vault-cover-script">Because You Deserve It.</p>
            <p className="vault-cover-description">Premium beauty services, expert care,<br className="hidden sm:block" /> and a luxurious experience.</p>
            <Button asChild className="vault-cover-cta"><Link to="/vaultbot">Book your appointment <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          <div className="vault-cover-brand">
            <div className="vault-monogram" aria-hidden="true"><span className="vault-monogram-b">B</span><span className="vault-monogram-v">V</span><span className="vault-monogram-flourish" /><span className="vault-monogram-star">✦</span></div>
            <h1 className="vault-cover-name font-display">The Beauty Vault</h1>
            <p className="vault-cover-motto">Beauty <span>◆</span> Care <span>◆</span> Confidence</p>
            <div className="vault-brand-rule" aria-hidden="true"><span>✦</span></div>
          </div>
        </div>
      </section>
      <footer className="vault-cover-footer"><p>Your Beauty. Your Time. Your Vault.</p><Link to="/vaultbot">Enter the Vault <ArrowRight size={14} aria-hidden="true" /></Link></footer>
    </main>
  );
}