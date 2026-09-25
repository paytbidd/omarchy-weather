import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "payton.forecast"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function refresh() {
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  // Shape contract for shell.summon/hide/toggle routing (Bar.findPanelWidget
  // requires open/close/opened on the bar-widget root). Open maps to the
  // panel's hotkey path so summoning suppresses the center hover reveal,
  // matching what the old per-plugin IpcHandler did.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  visible: panelLoader.item && panelLoader.item.barLabel !== ""
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  readonly property real openPanelIndicatorWidth: contentRow.implicitWidth > 0 ? contentRow.implicitWidth : button.labelWidth

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: panelLoader.item ? panelLoader.item.barTempLabel : ""
    labelVisible: false
    hasVisualContent: text !== ""
    horizontalMargin: 8.75
    verticalPadding: 8.75
    fixedWidth: root.vertical ? -1 : contentRow.implicitWidth + Style.spaceReal(horizontalMargin) * 2
    // Tooltip suppressed because the panel is the detail view.
    tooltipText: ""

    onPressed: function(b) {
      if (!root.bar) return
      if (b === Qt.RightButton) root.bar.run("omarchy-notification-send \"$(omarchy-weather-status)\"")
      else if (b === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }

    Row {
      id: contentRow
      anchors.centerIn: parent
      spacing: 0

      Text {
        textFormat: Text.PlainText
        text: button.text
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }

      Item {
        id: uvChip
        property string live: panelLoader.item ? panelLoader.item.barUvLabel : ""
        property string painted: live
        property bool shown: live !== ""
        onLiveChanged: if (live !== "") painted = live
        width: shown ? uvText.implicitWidth + Style.space(8) : 0
        height: uvText.implicitHeight
        clip: true
        opacity: shown ? 1 : 0

        Behavior on width {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }
        Behavior on opacity {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }

        Text {
          id: uvText
          x: Style.space(8)
          textFormat: Text.PlainText
          text: uvChip.painted
          color: button.foreground
          font.family: button.fontFamily
          font.pixelSize: button.fontSize
          renderType: Text.NativeRendering
        }
      }

      Item {
        id: rainChip
        property string live: panelLoader.item ? panelLoader.item.barRainLabel : ""
        property string painted: live
        property bool shown: live !== ""
        onLiveChanged: if (live !== "") painted = live
        width: shown ? rainText.implicitWidth + Style.space(8) : 0
        height: rainText.implicitHeight
        clip: true
        opacity: shown ? 1 : 0

        Behavior on width {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }
        Behavior on opacity {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }

        Text {
          id: rainText
          x: Style.space(8)
          textFormat: Text.PlainText
          text: rainChip.painted
          color: button.foreground
          font.family: button.fontFamily
          font.pixelSize: button.fontSize
          renderType: Text.NativeRendering
        }
      }

      Item {
        id: sunClock
        // Copy the UV chip: bind the painted label, then break that binding
        // once a real value arrives so the text stays put while the slot collapses.
        property var clock: panelLoader.item ? panelLoader.item.barSunClock : null
        property string live: clock && clock.visible ? String(clock.label || "") : ""
        property string painted: live
        property bool shown: live !== ""
        onLiveChanged: if (live !== "") painted = live
        width: shown ? sunText.implicitWidth + Style.space(8) : 0
        height: sunText.implicitHeight
        clip: true
        opacity: shown ? 1 : 0

        Behavior on width {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }
        Behavior on opacity {
          NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
        }

        Text {
          id: sunText
          x: Style.space(8)
          textFormat: Text.PlainText
          text: sunClock.painted
          color: button.foreground
          font.family: button.fontFamily
          font.pixelSize: button.fontSize
          renderType: Text.NativeRendering
        }
      }
    }
  }
}
