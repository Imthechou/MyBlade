export const forgeMarkup = `
    <div class="workspace">
      <section class="v19-stage" id="stage" aria-label="3D 工作台">

        <div class="stage-top">
          <div class="forge-progress" id="steps" role="status"></div>
          <span class="live" id="stage-state" hidden></span>
        </div>
        <div class="stage-message" id="stage-message" aria-hidden="true"></div>
        <div class="stage-float" id="stage-float" aria-hidden="true"></div>
        <div class="stage-zones" id="stage-zones" aria-hidden="true"></div>
        <div class="ore-reveal" id="ore-reveal" hidden aria-hidden="true">
          <b id="ore-reveal-grade"></b>
          <span id="ore-reveal-sub"></span>
        </div>
        <div class="appraise-seal" id="appraise-seal" hidden aria-hidden="true">
          <b id="appraise-seal-grade"></b>
          <span>鉴定</span>
        </div>
        <div class="stage-loading" id="stage-loading" role="status" hidden>正在起炉…</div>
        <div class="stage-footer"><span id="stage-hint"></span></div>
      </section>
      <div id="ore-tools" class="ore-tools" hidden>
        <div id="ore-options" class="ore-grid" role="group" aria-label="候选原石"></div>
        <div class="inspection-tools">
          <button type="button" data-action="inspect-light" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 18 5-5 4 4-5 5zM12 11l7-5M14 13l7-1M10 9l2-7"/></svg><span>打灯</span></button>
          <button type="button" data-action="tap-ore"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 4-4 8 8-4 4zM12 14l7 7M17 6l2-2M19 10h3"/></svg><span>敲石</span></button>
          <button type="button" data-action="window-ore" id="window-ore"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 15 8-10 9 7-7 9-10-6zM7 17l10-9M4 21h17"/></svg><span>擦窗</span></button>
        </div>
      </div>

      <section class="panel" id="panel" aria-labelledby="title">
        <div class="panel-top">
          <div class="forge-heading">
            <h1 id="title"></h1>
            <div class="forge-heading-tools">
              <span id="bench-meta"></span>
              <button type="button" id="grip-focus" class="grip-focus" data-action="focus-grip" aria-pressed="false" hidden>查看刀柄</button>
            </div>
          </div>
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
