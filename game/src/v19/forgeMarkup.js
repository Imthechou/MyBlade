export const forgeMarkup = `
    <div class="workspace">
      <section class="v19-stage" id="stage" aria-label="3D 工作台">

        <div class="stage-top">
          <div class="forge-progress" id="steps" role="status"></div>
          <span class="live" id="stage-state" hidden></span>
          <button type="button" id="grip-focus" class="grip-focus" data-action="focus-grip" aria-pressed="false" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5M8 10.5h5m-2.5-2.5v5"/></svg><span>查看刀柄</span>
          </button>
        </div>
        <div class="stage-message" id="stage-message" aria-hidden="true"></div>
        <div id="ore-tools" class="ore-tools" hidden>
          <span id="inspection-note" aria-live="polite">转动原石，寻找露脉</span>
          <div class="inspection-tools">
            <button type="button" data-action="inspect-light" data-id="lamp" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 18 5-5 4 4-5 5zM12 11l7-5M14 13l7-1M10 9l2-7"/></svg>打灯</button>
            <button type="button" data-action="tap-ore"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4-4 8 8-4 4zM12 14l7 7M17 6l2-2M19 10h3"/></svg>敲石</button>
            <button type="button" data-action="window-ore" id="window-ore"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 15 8-10 9 7-7 9-10-6zM7 17l10-9M4 21h17"/></svg><span>擦窗 <small>3 CR</small></span></button>
          </div>
        </div>
        <div class="ore-echo" id="ore-echo" aria-hidden="true"></div>
        <div class="stage-footer"><span id="stage-hint"></span></div>
      </section>

      <section class="panel" id="panel" aria-labelledby="title">
        <div class="panel-top">
          <div class="forge-heading"><h1 id="title"></h1><span id="bench-meta"></span></div>
          <p id="description"></p>
        </div>
        <div id="tray" class="tray" aria-label="工作台选项"></div>
        <div id="readout"></div>
      </section>
    </div>
    <div class="action-stack forge-dock" id="actions"></div>

    <div id="announcer" class="sr-only" role="status" aria-live="polite"></div>
    <button type="button" id="save-notice" class="v19-save-notice" hidden></button>
`;
