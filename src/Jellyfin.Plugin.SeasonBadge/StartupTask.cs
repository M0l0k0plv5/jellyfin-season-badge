using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SeasonBadge;

/// <summary>
/// Registers the index.html transformation with the File Transformation plugin on server start.
/// </summary>
public class StartupTask : IScheduledTask
{
    private const string TransformationId = "7a828001-19d4-4d0d-b1a2-00ce54e49b2c";

    private readonly ILogger<StartupTask> _logger;

    public StartupTask(ILogger<StartupTask> logger)
    {
        _logger = logger;
    }

    public string Name => "Season Badge Startup";

    public string Key => "Jellyfin.Plugin.SeasonBadge.Startup";

    public string Description => "Registers the Season Badge script with the File Transformation plugin.";

    public string Category => "Season Badge";

    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        Assembly? fileTransformation = AssemblyLoadContext.All
            .SelectMany(x => x.Assemblies)
            .FirstOrDefault(x => x.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);

        MethodInfo? register = fileTransformation?
            .GetType("Jellyfin.Plugin.FileTransformation.PluginInterface")?
            .GetMethod("RegisterTransformation");

        if (register == null)
        {
            _logger.LogWarning("Season Badge: File Transformation plugin not found. Install it to show badges in the web client.");
            return Task.CompletedTask;
        }

        // Build the payload with the File Transformation plugin's own JObject type,
        // so this plugin doesn't need to ship or reference Newtonsoft.Json.
        Type payloadType = register.GetParameters()[0].ParameterType;
        MethodInfo? parse = payloadType.GetMethod("Parse", new[] { typeof(string) });

        string json = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["id"] = TransformationId,
            ["fileNamePattern"] = "index.html",
            ["callbackAssembly"] = typeof(StartupTask).Assembly.FullName!,
            ["callbackClass"] = typeof(Transformations).FullName!,
            ["callbackMethod"] = nameof(Transformations.IndexHtml)
        });

        object? payload = parse?.Invoke(null, new object[] { json });
        if (payload == null)
        {
            _logger.LogWarning("Season Badge: could not build the File Transformation payload.");
            return Task.CompletedTask;
        }

        register.Invoke(null, new[] { payload });
        _logger.LogInformation("Season Badge: registered index.html transformation.");
        progress.Report(100);
        return Task.CompletedTask;
    }

    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
    {
        yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger };
    }
}
