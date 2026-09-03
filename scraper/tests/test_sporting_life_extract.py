from __future__ import annotations

import unittest

from sporting_life.extract import FullResultPayload


class FullResultPayloadTest(unittest.TestCase):
    def test_normal_result_page_exposes_race_payload(self) -> None:
        payload = {
            "props": {
                "pageProps": {
                    "race": {
                        "race_summary": {
                            "race_summary_reference": {"id": 838523},
                        },
                        "rides": [],
                    },
                    "meeting": [],
                },
            },
        }

        result = FullResultPayload(page_url="https://example.test/race", payload=payload)

        self.assertEqual(result.race_payload, payload["props"]["pageProps"]["race"])
        self.assertEqual(result.race["race_summary"]["race_summary_reference"]["id"], 838523)

    def test_page_without_race_payload_is_detected_explicitly(self) -> None:
        payload = {
            "props": {
                "pageProps": {
                    "hasError": True,
                    "meeting": [],
                    "meetings": [],
                },
            },
        }

        result = FullResultPayload(page_url="https://example.test/race", payload=payload)

        self.assertIsNone(result.race_payload)
        with self.assertRaisesRegex(KeyError, "race"):
            _ = result.race


if __name__ == "__main__":
    unittest.main()
