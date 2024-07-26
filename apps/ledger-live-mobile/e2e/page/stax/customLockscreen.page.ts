import { getElementById, openDeeplink } from "../../helpers";
import { expect } from "detox";

const baseLink = "custom-image";

export default class CustomLockscreenPage {
  welcomeCustomImageTitle = () => getElementById("custom-image-welcome-title");
  welcomeChoosePictureButton = () => getElementById("custom-image-choose-picture-button");

  async openViaDeeplink() {
    await openDeeplink(baseLink);
  }

  async expectCustomLockscreenPage() {
    await expect(this.welcomeCustomImageTitle()).toBeVisible();
    await expect(this.welcomeChoosePictureButton()).toBeVisible();
  }
}
