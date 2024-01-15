import React, { useRef, useState, useEffect, useCallback } from "react";
import { Trans, withTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { clipboard, ipcRenderer } from "electron";
import styled from "styled-components";
import Box from "~/renderer/components/Box";
import IconCopy from "~/renderer/icons/Copy";
import IconDownloadFile from "~/renderer/icons/DownloadFile";
import { space } from "~/renderer/styles/theme";

const TransactionData = styled(Box).attrs(() => ({
  bg: "palette.background.default",
  borderRadius: 1,
  color: "palette.text.shade100",
  ff: "Inter",
  fontSize: 4,
  relative: true,
}))`
  border: ${p => `1px solid ${p.theme.colors.palette.divider}`};
  border-right: none;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  text-align: center;
  flex: 1;
  height: 200px;
  overflow-y: scroll;
`;

const TransactionDataWrapper = styled(Box).attrs(() => ({
  mx: 4,
  my: 3,
}))`
  cursor: text;
  user-select: text;
  word-break: break-all;
`;

const Feedback = styled(Box).attrs(() => ({
  sticky: true,
  bg: "palette.background.default",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 4,
  borderRadius: 1,
}))`
  margin-right: ${space[3] * 2 + 18}px;
  border: ${p => `1px solid ${p.theme.colors.palette.divider}`};
  border-right: none;
  border-bottom-right-radius: 0;
  border-top-right-radius: 0;
`;

const ClipboardSuspicious = styled.div`
  font-family: Inter;
  font-weight: 400;
  font-style: normal;
  font-size: 12px;
  align-self: center;
  color: ${p => p.theme.colors.alertRed};
`;

const Right = styled(Box).attrs(() => ({
  bg: "palette.background.paper",
  color: "palette.text.shade100",
  alignItems: "center",
  justifyContent: "space-evenly",
  borderRadius: 1,
}))`
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border: ${p => `1px solid ${p.theme.colors.palette.divider}`};
`;

const RightIconWrapper = styled(Box).attrs(() => ({
  px: 3,
  py: 3,
}))`
  width: ${space[3] * 2 + 16}px;
  z-index: 2;

  &:hover {
    opacity: 0.8;
  }
`;

type Props = {
  transactionData: string;
  t: TFunction;
  allowSave?: boolean;
};

function ReadOnlyTransactionField(props: Props) {
  const { transactionData, t, allowSave } = props;
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [clipboardChanged, setClipboardChanged] = useState(false);
  const copyTimeout = useRef<NodeJS.Timeout | undefined>();
  const saveTimeout = useRef<NodeJS.Timeout | undefined>();

  const handleClickCopy = useCallback(() => {
    clipboard.writeText(transactionData);
    setCopyFeedback(true);
    clearTimeout(copyTimeout.current);
    setTimeout(() => {
      const copiedTransactionData = clipboard.readText();
      if (copiedTransactionData !== transactionData) {
        setClipboardChanged(true);
      }
    }, 300);
    copyTimeout.current = setTimeout(() => setCopyFeedback(false), 1e3);
    clearTimeout(saveTimeout.current);
    setSaveFeedback(false);
  }, [transactionData]);

  const handleClickDownloadFile = useCallback(async () => {
    if (
      await ipcRenderer.invoke(
        "save-file-dialog",
        t("families.mimblewimble_coin.saveTransactionFile"),
        transactionData,
      )
    ) {
      setSaveFeedback(true);
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => setSaveFeedback(false), 1e3);
      clearTimeout(copyTimeout.current);
      setCopyFeedback(false);
    }
  }, [t, transactionData]);

  useEffect(() => {
    return () => {
      clearTimeout(copyTimeout.current);
      clearTimeout(saveTimeout.current);
    };
  }, []);

  return (
    <Box>
      {clipboardChanged ? (
        <ClipboardSuspicious>
          <Trans i18nKey="families.mimblewimble_coin.transactionCopiedSuspicious" />
        </ClipboardSuspicious>
      ) : null}
      <Box horizontal alignItems="stretch" position="relative">
        <TransactionData>
          <TransactionDataWrapper>{transactionData}</TransactionDataWrapper>
        </TransactionData>
        {copyFeedback ? (
          <Feedback>
            <Trans i18nKey="families.mimblewimble_coin.transactionCopied" />
          </Feedback>
        ) : saveFeedback ? (
          <Feedback>
            <Trans i18nKey="families.mimblewimble_coin.transactionSaved" />
          </Feedback>
        ) : null}
        <Right>
          <RightIconWrapper onClick={handleClickCopy}>
            <IconCopy size={16} />
          </RightIconWrapper>
          {allowSave ? (
            <RightIconWrapper onClick={handleClickDownloadFile}>
              <IconDownloadFile size={18} />
            </RightIconWrapper>
          ) : null}
        </Right>
      </Box>
    </Box>
  );
}

export default withTranslation()(ReadOnlyTransactionField);
