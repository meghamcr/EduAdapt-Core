using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace EduAdapt.Runtime
{
    public class RuntimeApiClient : MonoBehaviour
    {
        private string baseUrl;
        // Memory only: supplied by the host's authenticated identity integration.
        // Never serialized in scenes, PlayerPrefs, logs or a build-time asset.
        private string bearerToken;
        public bool Configured => !string.IsNullOrEmpty(baseUrl) && !string.IsNullOrEmpty(bearerToken);
        public bool Busy { get; private set; }
        public void Configure(string endpoint, string token)
        {
            if (Busy) throw new InvalidOperationException("REQUEST_IN_PROGRESS");
            if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || !string.IsNullOrEmpty(uri.UserInfo) ||
                uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.AbsolutePath != "/" ||
                !(uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback) ||
                string.IsNullOrWhiteSpace(token) || token.Length > 4096 || !System.Text.RegularExpressions.Regex.IsMatch(token, "^[A-Za-z0-9._~+/=-]+$"))
                throw new ArgumentException("RUNTIME_CONFIGURATION_INVALID");
            baseUrl = uri.GetLeftPart(UriPartial.Authority); bearerToken = token;
        }
        public void ClearCredential() { bearerToken = null; }
        private void OnDestroy() { ClearCredential(); }
        public IEnumerator Post(string path, string json, Action<string> success, Action<string> failure)
        {
            if (!Configured || Busy || string.IsNullOrEmpty(path) || !System.Text.RegularExpressions.Regex.IsMatch(path,
                "^/api/(learning/(levels|plans|launch)|runtime/sessions(/[A-Za-z0-9_-]{1,160}/(events|restore))?)$") ||
                json == null || Encoding.UTF8.GetByteCount(json) > 4096)
            { failure("RUNTIME_REQUEST_REJECTED"); yield break; }
            Busy = true;
            using (var request = new UnityWebRequest(baseUrl + path, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + bearerToken);
                request.timeout = 180;
                request.redirectLimit = 0; // Never forward credentials to a redirected endpoint.
                yield return request.SendWebRequest();
                Busy = false;
                if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200)
                { failure("RUNTIME_HTTP_" + request.responseCode); yield break; }
                if (request.downloadedBytes > 1048576) { failure("RUNTIME_RESPONSE_TOO_LARGE"); yield break; }
                success(request.downloadHandler.text);
            }
        }
    }
}
