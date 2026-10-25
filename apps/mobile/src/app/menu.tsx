// ☰ menu from My Ballot (UX.md §3.6).
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { RowLink } from "@/components/kit";
import { Kicker, Screen, TextButton, Title } from "@/components/ui";
import type { IconName } from "@/components/art";
import { useSession } from "@/session";

export default function Menu() {
  const router = useRouter();
  const session = useSession();
  const revealed = session.state.phase === "revealed";
  const go = (href: Href) => {
    router.back();
    router.push(href);
  };

  const items: { title: string; detail: string; icon: IconName; href: Href }[] = [
    ...(revealed
      ? [
          {
            title: "Share card",
            detail: "Stats only, rendered on this phone",
            icon: "envelope" as const,
            href: "/unmask/share" as Href,
          },
        ]
      : []),
    {
      title: "My ballot notes",
      detail: "Your picks in ballot order",
      icon: "scroll",
      href: "/notes",
    },
    {
      title: "What matters to you",
      detail: "Your answers from the deck",
      icon: "star",
      href: "/priorities",
    },
    {
      title: "Daily Challenge",
      detail: "A short puzzle, never from your ballot",
      icon: "sparkle",
      href: "/daily",
    },
    {
      title: "How it works",
      detail: "Sources, methods and limits",
      icon: "book",
      href: "/how-it-works",
    },
    {
      title: "About",
      detail: "Nonpartisan statement and data release",
      icon: "info",
      href: "/about",
    },
    {
      title: "Report an error",
      detail: "Never includes your answers or picks",
      icon: "info",
      href: "/report",
    },
    {
      title: "Settings",
      detail: "Privacy, start over, delete everything",
      icon: "lock",
      href: "/settings",
    },
  ];

  return (
    <Screen footer={<TextButton label="Close" onPress={() => router.back()} />}>
      <Kicker>Menu</Kicker>
      <Title>The back of the book</Title>
      {items
        // The deck summary is for changing answers, which ends at the Unmasking.
        .filter((item) => !(revealed && item.href === "/priorities"))
        .map((item) => (
          <RowLink
            key={item.title}
            title={item.title}
            detail={item.detail}
            icon={item.icon}
            onPress={() => go(item.href)}
          />
        ))}
    </Screen>
  );
}
