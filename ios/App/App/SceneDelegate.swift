import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// The web view's controller, with the app's own native plugin added to it.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(WebAuthSessionPlugin())
    }
}

// Sign in with Apple through the system's own sheet. The earlier way (a web page in a browser that had to hand the sign-in back to the app through a link) ended on a blank
// screen for App Review on an iPad, so the app now asks the system directly and passes Apple's signed token to Supabase (src/service.js, signInWithApple).
// authorize({ nonce }): `nonce` is a random one-time value; Apple is given its SHA-256 and Supabase is given the original, which is how the token is tied to this attempt.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var authorizationController: ASAuthorizationController?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = call.getString("nonce"), !nonce.isEmpty {
                request.nonce = AppleSignInPlugin.sha256Hex(nonce)
            }
            self.pendingCall = call
            self.bridge?.saveCall(call)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.authorizationController = controller
            controller.performRequests()
        }
    }

    // Where the sheet appears. Without this the sheet has nowhere to open on an iPad.
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = self.bridge?.viewController?.view.window { return window }
        return ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        finish()
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return a sign-in token.", "no_token")
            self.bridge?.releaseCall(call)
            return
        }
        var result: [String: Any] = ["identityToken": identityToken, "user": credential.user]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) { result["authorizationCode"] = code }
        if let email = credential.email { result["email"] = email }
        if let givenName = credential.fullName?.givenName { result["givenName"] = givenName }
        if let familyName = credential.fullName?.familyName { result["familyName"] = familyName }
        call.resolve(result)
        self.bridge?.releaseCall(call)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        finish()
        let code = (error as? ASAuthorizationError)?.code == .canceled ? "canceled" : "failed"
        call.reject(error.localizedDescription, code)
        self.bridge?.releaseCall(call)
    }

    private func finish() {
        pendingCall = nil
        authorizationController = nil
    }

    private static func sha256Hex(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

// Web sign-in (Google) through Apple's own web-sign-in window. The earlier way (an in-app browser that had to be sent back to the app by a custom link) never returned on iPhone and ended
// on a blank screen, so the app now opens the provider's page in ASWebAuthenticationSession, which hands the finished link (com.credabilia.app://auth/callback?code=...) straight back here
// without any redirect that iOS can drop. src/service.js (oauthSignIn) passes the address and the link scheme, and finishes the sign-in with the code.
@objc(WebAuthSessionPlugin)
public class WebAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthSessionPlugin"
    public let jsName = "WebAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address),
              let scheme = call.getString("callbackScheme"), !scheme.isEmpty else {
            call.reject("A sign-in address and a return scheme are needed.", "bad_request")
            return
        }
        DispatchQueue.main.async {
            self.bridge?.saveCall(call)
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackURL, error in
                DispatchQueue.main.async {
                    self.session = nil
                    if let error = error {
                        let code = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin ? "canceled" : "failed"
                        call.reject(error.localizedDescription, code)
                    } else if let callbackURL = callbackURL {
                        call.resolve(["url": callbackURL.absoluteString])
                    } else {
                        call.reject("No sign-in result came back.", "no_result")
                    }
                    self.bridge?.releaseCall(call)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("The sign-in window could not open.", "failed")
                self.bridge?.releaseCall(call)
            }
        }
    }

    // Where the sign-in window appears. Without this it has nowhere to open on an iPad.
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = self.bridge?.viewController?.view.window { return window }
        return ASPresentationAnchor()
    }
}
