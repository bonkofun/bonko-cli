import { connectStandaloneTemplate, type StaticPresentation } from "@bonko/template-sdk/runtime-client";

// Minimal static draft, not finished artwork. Use ordinary text nodes and the
// supplied photo/crop; never substitute user text into executable markup.
const root = document.getElementById("root");
if (!root) throw new Error("Missing isolated template root");
const card = document.createElement("article");
const name = document.createElement("h1");
const message = document.createElement("p");
const sender = document.createElement("p");
const frame = document.createElement("div");
const photo = document.createElement("img");
card.style.cssText = "padding:24px;min-height:100%;box-sizing:border-box;background:#fff9ed;color:#292620;font-family:system-ui;overflow-wrap:anywhere";
frame.style.cssText = "aspect-ratio:1;overflow:hidden;border-radius:16px";
photo.style.cssText = "width:100%;height:100%;object-fit:cover";
message.style.whiteSpace = "pre-wrap";
photo.alt = "Personal photo";
photo.addEventListener("error", () => { photo.hidden = true; });
frame.append(photo);
card.append(frame, name, message, sender);
root.replaceChildren(card);

function showContent(content: StaticPresentation["content"]) {
    name.textContent = content.recipientName;
    message.textContent = content.message;
    sender.textContent = content.senderName ?? "";
    sender.hidden = !content.senderName;
    if (photo.getAttribute("src") !== content.photoUrl) {
      photo.hidden = false;
      photo.src = content.photoUrl;
    }
    photo.style.transform = content.photoTransform;
}

connectStandaloneTemplate({
  render({ content, runtime }) {
    showContent(content);
    if (runtime.state === "running") runtime.complete();
  },
  renderStatic({ content }) {
    showContent(content);
    root.replaceChildren(card);
    return () => card.remove();
  },
  dispose() { card.remove(); },
});
