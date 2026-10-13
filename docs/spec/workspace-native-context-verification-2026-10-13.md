# Native context verification: current boundaries

Source candidate `d938e1d949880f541a64d3e9aba1610ec9122b43`, six-file Adapter snapshot `candidate-d12d17b8-3cce-4454-8a9f-bc1db6781b34`. The split consumer owns and operates the Native instance. Adapter-side work reads the saved receipts and performs source/offline verification; it does not drive the active client.

## Verified ordinary-thread path

Consumer sample `consumer-75f4200e-b5b5-45e2-941e-96d1f591e07e`, source SHA256 `1374486504b8596eed3db77289a4679be1ff1e75c97c5255806b8fb55a277967`.

The complete saved receipts were read on the Adapter side:

| Receipt | Active bodies | Consumer errors | Input errors | Native selection | Result |
| --- | --- | --- | --- | --- | --- |
| `1791893234640-9c935178-f45b-414b-946c-dfa18cb1d4fa` | 8 | empty | empty | fixture 0; consumer unselected | entry ready |
| `1791893258178-959674bb-9045-496e-a9f9-c251897e0e5c` | 8 | empty | empty | fixture 1 | input confirmed/focused |
| `1791893281943-8e520803-a8d6-4874-a5ed-8c87f7a9de7e` | 0 | empty | empty | fixture 0 | default exit restored |

All three report `additionalEditors:0`. The first two report preserved body nodes. The current `bodyViewport` shares the full Native scroller interval, top 96/bottom 1095; the consumer independently clips its body before the footer at top 981. Independent sidebar configuration was off/null in this path. These are ordinary-route/context checks, not a new unsent draft or right-viewport acceptance result.

Saved receipt directory: `X:/codlet-split-workbench/.checks/native-comparison/consumer-75f4200e-b5b5-45e2-941e-96d1f591e07e/driver/`.

## Remaining Native checks

Real new unsent-page restoration, independent right-pane open/resize/content/settings release, and summary visibility/body/footer alignment remain with the consumer-owned Native round. No complete release acceptance, numeric performance result or durable atom-store flush is inferred from the ordinary-thread receipts. User-confirmed manual window dragging is accepted; unsuccessful Computer Use window movement is not treated as a product failure.

The earlier `ce737`/57098b2 sample remains failed for eight `Missing parent scope` body errors despite a successful ordinary route return. It is not upgraded by the corrected candidate's success. The nearest-provider ordering correction and the additional repeated-Context tests are documented separately.
