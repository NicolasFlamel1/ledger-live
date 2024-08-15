import { getElementById, openDeeplink, tapByElement, waitForElementById } from "../../helpers";
import { expect } from "detox";

const baseLink = "nftgallery";

export default class NftGalleryPage {
  root = () => getElementById("wallet-nft-gallery-screen");
  emptyScreen = () => getElementById("wallet-nft-gallery-empty");
  emptyScreenResetButton = () => getElementById("wallet-nft-gallery-empty-reset-button");
  nftListComponentId = "wallet-nft-gallery-list";
  nftListComponent = () => getElementById(this.nftListComponentId);
  nftAddNewListItem = () => getElementById("wallet-nft-gallery-add-new-list-item");
  receiveNftButton = () => getElementById("wallet-nft-gallery-receive-nft-button");
  nftReceiveModalContinueButton = () =>
    getElementById("wallet-nft-gallery-receive-modal-continue-button");
  nftReceiveModal = () => getElementById("wallet-nft-gallery-receive-modal");
  nftFilterDrawer = () => getElementById("wallet-nft-gallery-filter-drawer");
  selectAndHide = () => getElementById("wallet-nft-gallery-select-and-hide");
  confirmHide = () => getElementById("wallet-nft-gallery-confirm-hide");
  nftListItem = (index: number) => getElementById(`wallet-nft-gallery-list-item-${index}`);

  async openViaDeeplink() {
    await openDeeplink(baseLink);
  }

  async clickOnNft(index = 0) {
    await tapByElement(this.nftListItem(index));
  }

  async hideNft(index = 0) {
    await expect(this.nftListItem(index)).toBeVisible();
    await tapByElement(this.selectAndHide());
    await tapByElement(this.nftListItem(index));
    await tapByElement(this.confirmHide());
    await expect(this.nftListItem(index)).not.toBeVisible();
  }

  async continueFromReceiveNFTsModal() {
    await tapByElement(this.nftReceiveModalContinueButton());
  }

  async waitForList() {
    await waitForElementById(this.nftListComponentId);
  }

  async expectGalleryVisible() {
    await expect(this.root()).toBeVisible();
  }

  async expectGalleryNotVisible() {
    await expect(this.root()).not.toBeVisible();
  }

  async expectGalleryEmptyState() {
    await this.expectGalleryVisible();
    await expect(this.emptyScreen()).toBeVisible(50);
  }

  async expectNftVisible(index = 0) {
    await expect(this.nftListItem(index)).toBeVisible();
  }

  async expectFilterDrawerVisible() {
    await expect(this.nftFilterDrawer()).toBeVisible();
  }

  async expectFilterDrawerNotVisible() {
    await expect(this.nftFilterDrawer()).not.toBeVisible();
  }

  async expectNftReceiveModalVisible() {
    await expect(this.nftReceiveModal()).toBeVisible();
  }
}
