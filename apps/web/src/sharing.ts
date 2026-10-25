export type Invite = { questions: number; contests: number; sample: boolean };

function count(value: string | null): number {
  return value && /^\d{1,4}$/.test(value) ? Math.min(Number(value), 999) : 0;
}

export function readInvite(hash: string): Invite {
  const params = new URLSearchParams(hash.startsWith("#invite?") ? hash.slice(8) : "");
  return { questions: count(params.get("questions")), contests: count(params.get("contests")), sample: params.get("sample") === "1" };
}

export function inviteLink(base: string, invite: Invite): string {
  const url = new URL(base);
  url.search = "";
  const params = new URLSearchParams({ questions: String(count(String(invite.questions))), contests: String(count(String(invite.contests))), sample: invite.sample ? "1" : "0" });
  url.hash = `invite?${params}`;
  return url.toString();
}

export const INVITATION = "Make a wish. Know your choice. Join me in preparing for the ballot: explore the evidence before the names with Wishing Well.";

/** The card is drawn on this device; no image upload or rendering service. */
export async function renderShareCard(invite: Invite, base: string): Promise<Blob> {
  await document.fonts.ready;
  const logo = new Image();
  logo.src = "/wishing-well-logo.png";
  await logo.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable in this browser.");
  ctx.fillStyle = "#F3E8D5"; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#FFF9EE";
  ctx.beginPath(); ctx.roundRect(40, 40, 1000, 1270, 54); ctx.fill();
  ctx.strokeStyle = "#7A3B3B"; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = "#D6BA94"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(58, 58, 964, 1234, 42); ctx.stroke();
  ctx.drawImage(logo, 375, 100, 330, 330);
  ctx.textAlign = "center";
  const line = (text: string, y: number, font: string, color = "#382E29") => {
    ctx.font = font; ctx.fillStyle = color; ctx.fillText(text, 540, y, 900);
  };
  line("WISHING WELL", 489, "28px Georgia", "#7A3B3B");
  line("Make a wish.", 595, "72px Georgia");
  line("Know your choice.", 681, "italic 72px Georgia", "#7A3B3B");
  line("Let’s get ballot-ready, together.", 765, "32px system-ui");
  if (invite.questions || invite.contests) {
    line(`${invite.questions} questions explored  ·  ${invite.contests} contests revealed`, 868, "28px system-ui", "#354F43");
    line(invite.sample ? "FICTIONAL DEMO · SHARED PROGRESS" : "SHARED PROGRESS · SELF-REPORTED", 916, "20px system-ui", "#715C4C");
  } else {
    line("Read the plans before the names.", 868, "30px system-ui", "#354F43");
    line("Explore the evidence. Make your own choice.", 916, "24px system-ui", "#715C4C");
  }
  ctx.strokeStyle = "#D6BA94"; ctx.beginPath(); ctx.moveTo(220, 990); ctx.lineTo(860, 990); ctx.stroke();
  line(new URL(base).host, 1068, "30px Georgia", "#7A3B3B");
  line("Open the invitation link to join in.", 1122, "24px system-ui");
  line("No names. No picks. No endorsements.", 1220, "22px system-ui", "#715C4C");
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the image.")), "image/png"));
}

export function downloadCard(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "wishing-well-invitation.png";
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
