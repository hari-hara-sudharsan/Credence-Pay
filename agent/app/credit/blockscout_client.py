import requests


class BlockscoutClient:

    BASE_URL = "https://hashkey.blockscout.com/api/v2"

    def get_address(self, address: str):
        try:
            url = f"{self.BASE_URL}/addresses/{address}"
            response = requests.get(url, timeout=5)
            if response.status_code in [200, 201]:
                return response.json()
            return {}
        except Exception:
            return {}

    def get_transactions(self, address: str):
        try:
            url = f"{self.BASE_URL}/addresses/{address}/transactions"
            response = requests.get(url, timeout=5)
            if response.status_code in [200, 201]:
                return response.json()
            return {"items": []}
        except Exception:
            return {"items": []}