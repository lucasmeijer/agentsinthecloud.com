import { Application, Controller } from "./stimulus.js";

class InstallController extends Controller {
  static targets = ["panel", "devCommand", "serverCommand", "feedback"];

  show({ params: { view } }) {
    for (const panel of this.panelTargets) panel.hidden = panel.dataset.view !== view;
    const active = this.panelTargets.find(panel => panel.dataset.view === view);
    active.querySelector("h3, button").focus({ preventScroll: true });
    this.feedbackTarget.textContent = "";
  }

  async copy({ params: { command } }) {
    const text = command === "dev" ? this.devCommandTarget.textContent : this.serverCommandTarget.textContent;
    try {
      await navigator.clipboard.writeText(text);
      this.feedbackTarget.textContent = "Command copied. Paste it into your terminal.";
    } catch (error) {
      this.feedbackTarget.textContent = "Clipboard access was denied. Select the command above and copy it manually.";
      throw error;
    }
  }
}

class AgentInfoController extends Controller {
  toggle() {
    const open = !this.element.hasAttribute("data-open");
    this.element.toggleAttribute("data-open", open);
    this.element.toggleAttribute("data-dismissed", !open);
  }

  dismiss() {
    this.element.removeAttribute("data-open");
    this.element.setAttribute("data-dismissed", "");
  }

  reset() { this.element.removeAttribute("data-dismissed"); }
  close() { this.element.removeAttribute("data-open"); }
}

const application = Application.start();
application.register("agent-info", AgentInfoController);
application.register("install", InstallController);
