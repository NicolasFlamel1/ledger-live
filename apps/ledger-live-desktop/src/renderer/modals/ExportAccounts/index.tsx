import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Account } from "@ledgerhq/types-live";
import Modal, { ModalBody } from "~/renderer/components/Modal";
import Box from "~/renderer/components/Box";
import Button from "~/renderer/components/Button";
import Exporter from "~/renderer/components/Exporter";
type ModalRenderProps = {
  onClose?: (() => void) | undefined;
  data?: unknown;
};
const ExportAccountsModal = () => {
  const { t } = useTranslation();
  return (
    <Modal
      name="MODAL_EXPORT_ACCOUNTS"
      render={({ onClose, data }: ModalRenderProps) => {
        return (
          <ModalBody
            onClose={onClose}
            title={t("settings.export.modal.title")}
            render={() => (
              <Exporter
                {...(data as {
                  accounts?: Account[];
                })}
              />
            )}
            renderFooter={() => (
              <Box>
                <Button data-testid={"modal-confirm-button"} small onClick={onClose} primary>
                  <Trans i18nKey="settings.export.modal.button" />
                </Button>
              </Box>
            )}
          />
        );
      }}
    />
  );
};
export default ExportAccountsModal;
