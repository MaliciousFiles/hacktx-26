import { useEffect, useState } from "react";
import { downloadCard, inviteLink, INVITATION, renderShareCard, type Invite } from "./sharing";

export function ShareCard({ invite }: { invite: Invite }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const url = inviteLink(window.location.href, invite);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    renderShareCard(invite, window.location.href).then((image) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(image); setBlob(image); setPreview(objectUrl);
    }).catch(() => { if (active) setNote("The image could not load. You can still copy and send the invitation link below."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [invite.questions, invite.contests, invite.sample]);

  const share = async () => {
    if (!blob || busy) return;
    setBusy(true); setNote("");
    try {
      const file = new File([blob], "wishing-well-invitation.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Wishing Well", text: INVITATION, url });
      } else if (navigator.share) {
        await navigator.share({ title: "Wishing Well", text: INVITATION, url });
        setNote("Invitation shared. This browser shares links rather than image attachments.");
      } else {
        await navigator.clipboard.writeText(url);
        setNote("Invitation link copied. This browser does not support a share sheet; paste the link into a message.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setNote("Sharing is unavailable here. Copy the invitation link below to send it—no download needed.");
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setNote("Invitation link copied. Send it to someone you want to prepare with."); }
    catch { setNote("Select and copy the invitation link below."); }
  };

  return <section className="share-section" aria-labelledby="share-title">
    <div className="share-preview">
      {preview ? <img src={preview} width="1080" height="1350" alt={`Wishing Well invitation: Make a wish. Know your choice. ${invite.questions} questions explored, ${invite.contests} contests revealed.${invite.sample ? " Fictional demo." : ""}`} /> : <div className="image-placeholder">Preparing your invitation…</div>}
    </div>
    <div className="share-copy">
      <p className="eyebrow">Good preparation is worth sharing</p>
      <h2>Bring a friend<br /><em>to the well.</em></h2>
      <p>Invite someone to explore their ballot with a little more curiosity. Send this illustrated card and the link together.</p>
      {(invite.questions > 0 || invite.contests > 0) && <p className="note">This invitation includes shared progress counts{invite.sample ? " from the fictional demo" : ""}. These are not your own answers or a voting recommendation.</p>}
      <div className="actions"><button disabled={!blob || busy} onClick={() => void share()}>{busy ? "Opening share sheet…" : "Share image + invitation ↗"}</button><button className="secondary" disabled={!blob} onClick={() => blob && downloadCard(blob)}>Download image</button></div>
      <label htmlFor="invitation-link">Invitation link</label>
      <div className="copy-row"><input id="invitation-link" readOnly value={url} onFocus={(event) => event.target.select()} /><button className="secondary" onClick={() => void copy()}>Copy</button></div>
      <p role="status" className="status">{note}</p>
      <p className="fine-print">Only counts appear on this card. No candidate names, parties, picks or answers. Images are created on your device. Link previews use the generic invitation artwork.</p>
    </div>
  </section>;
}
