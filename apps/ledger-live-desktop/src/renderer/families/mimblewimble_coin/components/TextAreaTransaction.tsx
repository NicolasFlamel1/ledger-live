import React, { PureComponent, createRef } from "react";
import styled from "styled-components";
import { withTranslation } from "react-i18next";
import { TFunction } from "i18next";
import Box from "~/renderer/components/Box";
import TextArea from "~/renderer/components/TextArea";
import QRCodeCameraPickerCanvas from "~/renderer/components/QRCodeCameraPickerCanvas";
import { radii, space } from "~/renderer/styles/theme";
import IconQrCode from "~/renderer/icons/QrCode";
import IconUploadFile from "~/renderer/icons/UploadFile";
import { ipcRenderer } from "electron";
import { track } from "~/renderer/analytics/segment";

const Right = styled(Box).attrs(() => ({
  bg: "palette.background.default",
  alignItems: "center",
  justifyContent: "space-evenly",
}))`
  border-top-right-radius: ${radii[1]}px;
  border-bottom-right-radius: ${radii[1]}px;
  border-left: 1px solid ${p => p.theme.colors.palette.divider};
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

const QrCodeWrapper = styled(Box)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
`;

const BackgroundLayer = styled(Box)`
  position: fixed;
  right: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
`;

type Props = {
  onChange: (s: string) => void;
  t: TFunction;
  value: string;
  error: Error | undefined;
  warning: Error | undefined;
};

type State = {
  qrReaderOpened: boolean;
};

class TextAreaTransaction extends PureComponent<Props, State> {
  private element: React.RefObject<HTMLTextAreaElement>;

  constructor(props: Props) {
    super(props);
    this.state = {
      qrReaderOpened: false,
    };
    this.element = createRef();
  }

  handleClickQrCode = () => {
    const { qrReaderOpened } = this.state;
    this.setState((previousState: State) => ({
      qrReaderOpened: !previousState.qrReaderOpened,
    }));
    !qrReaderOpened ? track("Send Flow QR Code Opened") : track("Send Flow QR Code Closed");
  };

  handlePickQrCode = (value: string) => {
    this.setValue(value);
    this.setState({
      qrReaderOpened: false,
    });
  };

  handleClickUploadFile = async () => {
    const { t } = this.props;
    const fileContents = await ipcRenderer.invoke(
      "open-file-dialog",
      t("families.mimblewimble_coin.openTransactionFile"),
    );
    if (fileContents !== undefined) {
      this.setValue(fileContents);
    }
  };

  setValue = (value: string) => {
    const { onChange } = this.props;
    onChange(value);
    this.element.current!.scrollTop = 0;
  };

  render() {
    const { qrReaderOpened } = this.state;

    return (
      <TextArea
        {...this.props}
        ref={this.element}
        style={{ wordBreak: "break-all", fontVariantLigatures: "none" }}
        spellCheck="false"
        renderRight={
          <Right>
            <RightIconWrapper
              style={qrReaderOpened ? { opacity: 1 } : {}}
              onClick={this.handleClickQrCode}
            >
              <IconQrCode size={16} />
              {qrReaderOpened ? (
                <>
                  <BackgroundLayer />
                  <QrCodeWrapper>
                    <QRCodeCameraPickerCanvas onPick={this.handlePickQrCode} />
                  </QrCodeWrapper>
                </>
              ) : null}
            </RightIconWrapper>
            <RightIconWrapper onClick={this.handleClickUploadFile}>
              <IconUploadFile size={18} />
            </RightIconWrapper>
          </Right>
        }
      />
    );
  }
}

export default withTranslation()(TextAreaTransaction);
